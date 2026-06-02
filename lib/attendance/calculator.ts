// ============================================================
// 耀聖藥局智慧排班系統 - 月度工時統計計算
// ============================================================

import type { ScheduleEntry, OvertimeApplication, LeaveApplication, MonthlyStats } from '@/lib/types';

/**
 * 各班別對應的工時（小時）
 */
export const SHIFT_HOURS: Record<string, number> = {
  A: 8,
  B: 4,
  C: 4,
  D: 4,
  E: 8,
  X: 0,
};

/**
 * 計算兩個時間字串之間的時數差（小時，十進位）。
 *
 * @param startTime - 起始時間，格式 'HH:MM' 或 'HH:MM:SS'
 * @param endTime   - 結束時間，格式 'HH:MM' 或 'HH:MM:SS'
 * @returns 時數差（小時，十進位）
 */
export function calculateDuration(startTime: string, endTime: string): number {
  const parseMinutes = (time: string): number => {
    const parts = time.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    return hours * 60 + minutes;
  };

  const startMinutes = parseMinutes(startTime);
  const endMinutes = parseMinutes(endTime);
  const diffMinutes = endMinutes - startMinutes;

  return diffMinutes / 60;
}

/**
 * calculateMonthlyStats 的輸入參數
 */
export interface MonthlyStatsParams {
  userId: string;
  year: number;
  month: number;
  scheduleEntries: Pick<ScheduleEntry, 'shift_code'>[];
  approvedOvertimes: Pick<OvertimeApplication, 'start_time' | 'end_time' | 'compensation'>[];
  approvedLeaves: Pick<LeaveApplication, 'period'>[];
}

/**
 * 計算員工月度工時統計。
 *
 * 計算邏輯：
 * - workDays:       班別代碼不為 'X' 的條目數量
 * - workHours:      各班別代碼對應時數的總和
 * - overtimeHours:  compensation === 'pay' 的加班申請時數總和
 * - compLeaveHours: compensation === 'comp_leave' 的加班申請時數總和
 * - leaveHours:     全天假 8 小時，半天假 4 小時的總和
 *
 * @param params - MonthlyStatsParams
 * @returns MonthlyStats（所有時數精確至小數點後兩位）
 */
export function calculateMonthlyStats(params: MonthlyStatsParams): MonthlyStats {
  const { userId, year, month, scheduleEntries, approvedOvertimes, approvedLeaves } = params;

  // 上班天數（排除排休）
  const workDays = scheduleEntries.filter(e => e.shift_code !== 'X').length;

  // 上班時數
  const workHoursRaw = scheduleEntries.reduce(
    (sum, e) => sum + (SHIFT_HOURS[e.shift_code] ?? 0),
    0
  );

  // 加班費時數（compensation === 'pay'）
  const overtimeHoursRaw = approvedOvertimes
    .filter(o => o.compensation === 'pay')
    .reduce((sum, o) => sum + calculateDuration(o.start_time, o.end_time), 0);

  // 補休時數（compensation === 'comp_leave'）
  const compLeaveHoursRaw = approvedOvertimes
    .filter(o => o.compensation === 'comp_leave')
    .reduce((sum, o) => sum + calculateDuration(o.start_time, o.end_time), 0);

  // 請假時數（全天 8 小時，半天 4 小時）
  const leaveHoursRaw = approvedLeaves.reduce(
    (sum, l) => sum + (l.period === 'full_day' ? 8 : 4),
    0
  );

  return {
    userId,
    year,
    month,
    workDays,
    workHours: parseFloat(workHoursRaw.toFixed(2)),
    overtimeHours: parseFloat(overtimeHoursRaw.toFixed(2)),
    compLeaveHours: parseFloat(compLeaveHoursRaw.toFixed(2)),
    leaveHours: parseFloat(leaveHoursRaw.toFixed(2)),
  };
}
