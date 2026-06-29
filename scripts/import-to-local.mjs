/**
 * 將 cloud-export 備份匯入本機 Supabase
 *
 * 前置：
 *   1. 已執行 npm run data:export
 *   2. 本機 Supabase 已啟動（supabase start）
 *   3. 已套用 migrations（supabase db push 或手動執行 SQL）
 *   4. 複製 scripts/.env.local-db.example → scripts/.env.local-db
 *
 * 執行：npm run data:import
 */

import { createClient } from "./supabase-client.mjs";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { loadEnvFile } from "./load-env.mjs";
import { PUBLIC_TABLES, STORAGE_BUCKETS, resolvePaths } from "./data-config.mjs";

loadEnvFile(".env.local-db");

const url = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("錯誤：請在 scripts/.env.local-db 設定 LOCAL_SUPABASE_SERVICE_ROLE_KEY");
  console.error("提示：執行 supabase status 可取得本機 service_role key");
  process.exit(1);
}

const paths = resolvePaths();

function findExportDir() {
  const latestFile = join(paths.backups, "latest-export.txt");
  if (existsSync(latestFile)) {
    const dir = readFileSync(latestFile, "utf8").trim();
    if (existsSync(dir)) return dir;
  }

  if (!existsSync(paths.backups)) {
    throw new Error(`找不到備份目錄：${paths.backups}，請先執行 npm run data:export`);
  }

  const exports = readdirSync(paths.backups)
    .filter((name) => name.startsWith("cloud-export-"))
    .sort()
    .reverse();

  if (exports.length === 0) {
    throw new Error("找不到 cloud-export 備份，請先執行 npm run data:export");
  }

  return join(paths.backups, exports[0]);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function readJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

async function importAuthUsers(exportDir) {
  const users = readJson(join(exportDir, "database", "auth-users.json"));
  if (!users || users.length === 0) {
    console.log("  （無 auth 使用者資料）");
    return 0;
  }

  let imported = 0;
  for (const user of users) {
    const { error } = await supabase.auth.admin.createUser({
      id: user.id,
      email: user.email,
      phone: user.phone || undefined,
      email_confirm: true,
      user_metadata: user.user_metadata || {},
      app_metadata: user.app_metadata || {},
      // 雲端密碼無法匯出，店長需重設密碼；員工使用姓名登入不受影響
      password: `temp-${user.id.slice(0, 8)}-reset-me`,
    });

    if (error) {
      if (error.message.includes("already been registered") || error.message.includes("already exists")) {
        console.log(`  略過（已存在）：${user.email || user.id}`);
      } else {
        console.warn(`  警告：${user.email || user.id}：${error.message}`);
      }
    } else {
      imported += 1;
    }
  }

  console.log(`  匯入 ${imported} / ${users.length} 位使用者`);
  return imported;
}

function sanitizeRows(table, rows) {
  if (table === "leave_month_locks") {
    return rows.map((row) => {
      const next = { ...row };
      if (next.created_at && !next.locked_at) {
        next.locked_at = next.created_at;
        delete next.created_at;
      }
      return next;
    });
  }
  return rows;
}

async function importTable(exportDir, table) {
  const raw = readJson(join(exportDir, "database", `${table}.json`));
  if (!raw || raw.length === 0) return 0;

  const rows = sanitizeRows(table, raw);

  const batchSize = 200;
  let imported = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    let { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });

    if (error) {
      ({ error } = await supabase.from(table).upsert(batch, { ignoreDuplicates: true }));
    }
    if (error) {
      const { error: insertError } = await supabase.from(table).insert(batch);
      if (insertError) {
        if (
          insertError.message.includes("duplicate key") ||
          insertError.message.includes("schema cache")
        ) {
          console.log(`  ${table}：（部分略過）${insertError.message}`);
          continue;
        }
        throw new Error(`${table} 匯入失敗：${insertError.message}`);
      }
    }

    imported += batch.length;
  }

  console.log(`  ${table}：${imported} 筆`);
  return imported;
}

async function importStorage(exportDir) {
  let total = 0;

  for (const bucket of STORAGE_BUCKETS) {
    const manifestPath = join(exportDir, "storage", bucket, "_manifest.json");
    const manifest = readJson(manifestPath);
    if (!manifest || manifest.length === 0) continue;

    for (const entry of manifest) {
      const localFile = join(exportDir, entry.local_file);
      if (!existsSync(localFile)) {
        console.warn(`  警告：找不到檔案 ${localFile}`);
        continue;
      }

      const fileBuffer = readFileSync(localFile);
      const { error } = await supabase.storage.from(bucket).upload(entry.storage_path, fileBuffer, {
        upsert: true,
        contentType: "application/octet-stream",
      });

      if (error) {
        console.warn(`  警告：上傳 ${entry.storage_path} 失敗：${error.message}`);
      } else {
        total += 1;
      }
    }

    console.log(`  ${bucket}：${total} 個檔案`);
  }

  return total;
}

async function main() {
  const exportDir = findExportDir();
  const manifest = readJson(join(exportDir, "manifest.json"));

  console.log("========================================");
  console.log("  匯入資料到本機 Supabase");
  console.log("========================================");
  console.log(`目標：${url}`);
  console.log(`來源：${exportDir}`);
  if (manifest?.exported_at) {
    console.log(`備份時間：${manifest.exported_at}`);
  }
  console.log("");

  console.log("[1/3] 匯入 auth 使用者...");
  await importAuthUsers(exportDir);

  console.log("[2/3] 匯入 public 資料表...");
  let rowTotal = 0;
  for (const table of PUBLIC_TABLES) {
    rowTotal += await importTable(exportDir, table);
  }

  console.log("[3/3] 匯入 Storage 附件...");
  const fileCount = await importStorage(exportDir);

  console.log("");
  console.log("匯入完成！");
  console.log(`  資料列：${rowTotal} 筆`);
  console.log(`  附件：${fileCount} 個`);
  console.log("");
  console.log("下一步：");
  console.log("  1. 複製 .env.local.example → .env.local，填入本機 Supabase 金鑰");
  console.log("  2. npm run data:seed-users     # 重設 admin/boss 預設密碼，或手動在員工管理修改");
  console.log("  3. npm run dev                 # 本機測試");
}

main().catch((err) => {
  console.error("匯入失敗：", err.message);
  process.exit(1);
});
