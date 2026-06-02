// ============================================================
// 耀聖藥局智慧排班系統 - 人力缺口計算
// ============================================================

/**
 * 晚班人力狀態
 * - critical: 0 人（紅色缺口警示 🔴）
 * - warning:  1 至 minRequired-1 人（黃色警告 🟡）
 * - normal:   恰好 minRequired 人（無警示）
 * - excess:   超過 minRequired 人（藍色提示 ℹ️）
 */
export type StaffingStatus = 'critical' | 'warning' | 'normal' | 'excess';

/**
 * 計算晚班人力狀態。
 *
 * @param eveningStaffCount - 當日晚班人數
 * @param minRequired       - 最低晚班人數要求（來自 scheduling_rules.min_evening_staff）
 * @returns StaffingStatus
 */
export function calculateEveningStaffingStatus(
  eveningStaffCount: number,
  minRequired: number
): StaffingStatus {
  if (eveningStaffCount === 0) return 'critical';
  if (eveningStaffCount < minRequired) return 'warning';
  if (eveningStaffCount === minRequired) return 'normal';
  return 'excess';
}

/**
 * 判斷班別代碼是否屬於晚班。
 * 晚班班別：D（晚班）、E（下午+晚班）
 *
 * @param shiftCode - 班別代碼
 * @returns true 若為晚班班別
 */
export function isEveningShift(shiftCode: string): boolean {
  return shiftCode === 'D' || shiftCode === 'E';
}
