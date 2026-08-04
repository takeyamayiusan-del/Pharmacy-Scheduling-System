/**
 * 本機資料存放路徑（固定於專案內 data/ 目錄，整包可搬移）
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 專案根目錄 */
export const PROJECT_ROOT = join(__dirname, "..");

/** 所有執行期資料的根目錄：<專案>/data */
export const DEFAULT_DATA_ROOT = join(PROJECT_ROOT, "data");

export const DATA_DIRS = {
  postgres: "postgres",
  storage: "storage",
  backups: "backups",
  appLogs: "app-logs",
};

/** public schema 資料表（依外鍵依賴排序，先父後子） */
export const PUBLIC_TABLES = [
  "scheduling_rules",
  "users",
  "shift_time_config",
  "app_settings",
  "payroll_rate_config",
  "annual_leave_config",
  "schedule_entries",
  "schedule_locks",
  "schedule_overrides",
  "fixed_shifts",
  "leave_selections",
  "wednesday_off_selections",
  "leave_month_locks",
  "leave_applications",
  "leave_attachments",
  "shift_swap_applications",
  "overtime_applications",
  "monthly_attendance_stats",
  "tardiness_records",
  "notifications",
  "punch_records",
  "employee_payroll_settings",
  "employee_salary_config",
  "monthly_payroll_adjustments",
  "payroll_records",
  "payroll_adjustments",
  "scheduling_notes",
  "comp_leave_ledger",
  "holidays",
  "bulletin_board",
  "bulletin_reads",
  "annual_leave_adjustments",
];

export const STORAGE_BUCKETS = ["leave-attachments"];

export function resolveDataRoot() {
  return DEFAULT_DATA_ROOT.replace(/\\/g, "/").replace(/\/$/, "");
}

export function resolvePaths() {
  const root = resolveDataRoot();
  return {
    root,
    postgres: `${root}/${DATA_DIRS.postgres}`,
    storage: `${root}/${DATA_DIRS.storage}`,
    backups: `${root}/${DATA_DIRS.backups}`,
    appLogs: `${root}/${DATA_DIRS.appLogs}`,
  };
}
