/**
 * 本機 Supabase 附件清理（不需 Supabase Cloud / Edge Function deploy）
 *
 * - 請假附件：超過 168 小時（7 天）
 * - 獎金佐證：超過 expires_at（預設 30 天）
 *
 * 前置：supabase start
 * 執行：npm run data:cleanup-attachments
 *
 * 建議用 Windows 工作排程器每日凌晨執行一次。
 */

import { loadEnvFile } from "./load-env.mjs";
import { createClient } from "./supabase-client.mjs";

loadEnvFile(".env.local-db");
loadEnvFile("../.env.local");

const url =
  process.env.LOCAL_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "http://127.0.0.1:54321";
const serviceKey =
  process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("錯誤：請在 scripts/.env.local-db 或 .env.local 設定 service role key");
  console.error("提示：supabase status 可取得金鑰");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function cleanupLeaveAttachments() {
  const expirationThreshold = new Date();
  expirationThreshold.setHours(expirationThreshold.getHours() - 168);

  const { data: rows, error } = await supabase
    .from("leave_attachments")
    .select("id, storage_path, file_name")
    .eq("status", "active")
    .lt("uploaded_at", expirationThreshold.toISOString());

  if (error) throw new Error(`查詢請假附件失敗：${error.message}`);

  let successCount = 0;
  let failCount = 0;

  for (const row of rows ?? []) {
    const { error: storageError } = await supabase.storage
      .from("leave-attachments")
      .remove([row.storage_path]);

    if (storageError) {
      await supabase
        .from("leave_attachments")
        .update({ status: "delete_failed" })
        .eq("id", row.id);
      failCount++;
      continue;
    }

    await supabase
      .from("leave_attachments")
      .update({ status: "expired", deleted_at: new Date().toISOString() })
      .eq("id", row.id);
    successCount++;
  }

  return { label: "leave-attachments", successCount, failCount, scanned: rows?.length ?? 0 };
}

async function cleanupPayrollBonusAttachments() {
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("payroll_adjustment_attachments")
    .select("id, storage_path, file_name")
    .lt("expires_at", nowIso);

  if (error) {
    if (String(error.message).includes("payroll_adjustment_attachments")) {
      return { label: "payroll-bonus-attachments", successCount: 0, failCount: 0, scanned: 0, skipped: true };
    }
    throw new Error(`查詢獎金附件失敗：${error.message}`);
  }

  let successCount = 0;
  let failCount = 0;

  for (const row of rows ?? []) {
    const { error: storageError } = await supabase.storage
      .from("payroll-bonus-attachments")
      .remove([row.storage_path]);

    if (storageError) {
      failCount++;
      continue;
    }

    const { error: deleteError } = await supabase
      .from("payroll_adjustment_attachments")
      .delete()
      .eq("id", row.id);

    if (deleteError) failCount++;
    else successCount++;
  }

  return {
    label: "payroll-bonus-attachments",
    successCount,
    failCount,
    scanned: rows?.length ?? 0,
  };
}

async function main() {
  console.log("========================================");
  console.log("  本機附件清理");
  console.log("========================================");
  console.log(`目標：${url}`);
  console.log("");

  const results = await Promise.all([
    cleanupLeaveAttachments(),
    cleanupPayrollBonusAttachments(),
  ]);

  for (const r of results) {
    if (r.skipped) {
      console.log(`[略過] ${r.label}（資料表尚未建立）`);
      continue;
    }
    console.log(
      `[${r.label}] 掃描 ${r.scanned} 筆 → 成功 ${r.successCount}，失敗 ${r.failCount}`
    );
  }

  const totalSuccess = results.reduce((n, r) => n + r.successCount, 0);
  const totalFail = results.reduce((n, r) => n + r.failCount, 0);
  console.log("");
  console.log(`完成：成功 ${totalSuccess}，失敗 ${totalFail}`);
}

main().catch((err) => {
  console.error("清理失敗：", err.message);
  process.exit(1);
});
