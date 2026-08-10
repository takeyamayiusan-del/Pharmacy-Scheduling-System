// ============================================================
// 耀聖藥局智慧排班系統 - 人力缺口計算
// ============================================================

import type { StoreConfig } from "@/lib/store-config";
import type { ShiftTimeConfig } from "@/lib/context/AppContext";
import { isEveningOrFullCoverageShift } from "@/lib/schedule/scheduleWarnings";

/**
 * 晚班人力狀態
 * - critical: 0 人（紅色缺口警示 🔴）
 * - warning:  1 至 minRequired-1 人（黃色警告 🟡）
 * - normal:   恰好 minRequired 人（無警示）
 * - excess:   超過 minRequired 人（藍色提示 ℹ️）
 */
export type StaffingStatus = "critical" | "warning" | "normal" | "excess";

/**
 * 計算晚班人力狀態。
 */
export function calculateEveningStaffingStatus(
  eveningStaffCount: number,
  minRequired: number
): StaffingStatus {
  if (eveningStaffCount === 0) return "critical";
  if (eveningStaffCount < minRequired) return "warning";
  if (eveningStaffCount === minRequired) return "normal";
  return "excess";
}

/**
 * 判斷班別代碼是否屬於晚班／含晚段。
 * 竹山：D、E；集集：目錄 night／all_day／split 或時段跨 18:00。
 */
export function isEveningShift(
  shiftCode: string,
  storeConfig?: StoreConfig,
  shiftTimeConfig?: ShiftTimeConfig
): boolean {
  if (shiftCode === "D" || shiftCode === "E") return true;
  if (!storeConfig) return false;
  return isEveningOrFullCoverageShift(shiftCode, storeConfig, shiftTimeConfig);
}
