/**
 * 從 Supabase 雲端匯出所有資料庫資料與 Storage 檔案
 *
 * 前置：複製 scripts/.env.cloud.example → scripts/.env.cloud 並填入雲端金鑰
 * 執行：npm run data:export
 */

import { createClient } from "./supabase-client.mjs";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { loadEnvFile } from "./load-env.mjs";
import {
  PUBLIC_TABLES,
  STORAGE_BUCKETS,
  resolvePaths,
} from "./data-config.mjs";

loadEnvFile(".env.cloud");

const url = process.env.CLOUD_SUPABASE_URL;
const serviceKey = process.env.CLOUD_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("錯誤：請在 scripts/.env.cloud 設定 CLOUD_SUPABASE_URL 與 CLOUD_SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const paths = resolvePaths();
const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const exportDir = join(paths.backups, `cloud-export-${timestamp}`);
const dbDir = join(exportDir, "database");
const storageDir = join(exportDir, "storage");

mkdirSync(dbDir, { recursive: true });
mkdirSync(storageDir, { recursive: true });

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function exportAuthUsers() {
  const allUsers = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`匯出 auth 使用者失敗：${error.message}`);

    allUsers.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }

  writeFileSync(join(dbDir, "auth-users.json"), JSON.stringify(allUsers, null, 2), "utf8");
  console.log(`  auth.users：${allUsers.length} 筆`);
  return allUsers.length;
}

function isMissingTableError(error) {
  const msg = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table")
  );
}

async function exportTable(table) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) {
      if (isMissingTableError(error)) {
        console.log(`  ${table}：（雲端無此表，略過）`);
        return 0;
      }
      throw new Error(`匯出 ${table} 失敗：${error.message}`);
    }

    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  writeFileSync(join(dbDir, `${table}.json`), JSON.stringify(rows, null, 2), "utf8");
  console.log(`  ${table}：${rows.length} 筆`);
  return rows.length;
}

async function listStorageFiles(bucket, prefix = "") {
  const files = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw new Error(`列出 Storage ${bucket}/${prefix} 失敗：${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        const nested = await listStorageFiles(bucket, itemPath);
        files.push(...nested);
      } else {
        files.push({ bucket, path: itemPath, name: item.name });
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  return files;
}

async function exportStorage() {
  let total = 0;

  for (const bucket of STORAGE_BUCKETS) {
    const bucketDir = join(storageDir, bucket);
    mkdirSync(bucketDir, { recursive: true });

    const files = await listStorageFiles(bucket);
    const manifest = [];

    for (const file of files) {
      const { data, error } = await supabase.storage.from(bucket).download(file.path);
      if (error) {
        console.warn(`  警告：無法下載 ${file.path}：${error.message}`);
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      const localPath = join(bucketDir, file.path.replace(/\//g, "__"));
      const localDir = dirname(localPath);
      mkdirSync(localDir, { recursive: true });
      writeFileSync(localPath, buffer);

      manifest.push({
        storage_path: file.path,
        local_file: relative(exportDir, localPath).replace(/\\/g, "/"),
      });
      total += 1;
    }

    writeFileSync(join(bucketDir, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    console.log(`  ${bucket}：${total} 個檔案`);
  }

  return total;
}

async function main() {
  console.log("========================================");
  console.log("  從 Supabase 雲端匯出資料");
  console.log("========================================");
  console.log(`來源：${url}`);
  console.log(`輸出：${exportDir}`);
  console.log("");

  console.log("[1/3] 匯出 auth 使用者...");
  const authCount = await exportAuthUsers();

  console.log("[2/3] 匯出 public 資料表...");
  let tableCount = 0;
  let rowTotal = 0;
  for (const table of PUBLIC_TABLES) {
    const count = await exportTable(table);
    if (count > 0) tableCount += 1;
    rowTotal += count;
  }

  console.log("[3/3] 匯出 Storage 附件...");
  const fileCount = await exportStorage();

  const manifest = {
    exported_at: new Date().toISOString(),
    source_url: url,
    auth_users: authCount,
    tables_exported: tableCount,
    rows_total: rowTotal,
    storage_files: fileCount,
    export_dir: exportDir,
  };

  writeFileSync(join(exportDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  writeFileSync(
    join(paths.backups, "latest-export.txt"),
    exportDir,
    "utf8"
  );

  console.log("");
  console.log("匯出完成！");
  console.log(`  備份位置：${exportDir}`);
  console.log(`  使用者：${authCount} 筆`);
  console.log(`  資料列：${rowTotal} 筆`);
  console.log(`  附件：${fileCount} 個`);
  console.log("");
  console.log("下一步：");
  console.log("  1. supabase start          # 啟動本機 Supabase");
  console.log("  2. supabase db push        # 套用資料庫結構");
  console.log("  3. npm run data:import     # 匯入資料到本機");
}

main().catch((err) => {
  console.error("匯出失敗：", err.message);
  process.exit(1);
});
