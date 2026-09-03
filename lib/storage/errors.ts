/** 將 Storage／資料庫權限錯誤轉成可執行的中文提示 */
export function formatStoragePermissionError(raw: string | null | undefined): string {
  const msg = String(raw ?? "").trim();
  if (!msg) return "檔案儲存失敗，請稍後再試";
  const lower = msg.toLowerCase();
  if (
    lower.includes("permission denied for schema storage") ||
    lower.includes("permission denied for schema \"storage\"") ||
    (lower.includes("permission denied") && lower.includes("storage"))
  ) {
    return (
      "檔案儲存權限不足（permission denied for schema storage）。" +
      "請在資料庫執行 scripts/sql/fix-storage-schema-grants.sql，或套用 migration 20260903160000_storage_schema_grants.sql 後重試。"
    );
  }
  if (lower.includes("bucket") && (lower.includes("not found") || lower.includes("does not exist"))) {
    return (
      "找不到附件儲存空間（Storage bucket）。" +
      "請執行 scripts/sql/fix-storage-schema-grants.sql 建立 leave-attachments 等 bucket 後重試。"
    );
  }
  return msg;
}
