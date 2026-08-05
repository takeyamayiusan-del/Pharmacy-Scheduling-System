// ============================================================
// 耀聖藥局智慧排班系統 - 月度工時統計計算
// ============================================================

import type { ScheduleEntry, OvertimeApplication, LeaveApplication, MonthlyStats } from '@/lib/types';

/**
 * 各班別對應的工時（小時）
 */
export const SHIFT_HOURS: Record<string, number> = {
  A: 8,
  B: 8,
  C: 3.5,
  D: 4.5,
  E: 8,
  X: 0,
};

/**
 * 後備國定假清單（僅在未傳入 holidayDates 時使用）。
 * 正式環境應以 holidays 資料表／getHolidayInfo 為準。
 */
export const FALLBACK_TAIWAN_HOLIDAYS_2026 = [
  '2026-01-01',
  '2026-01-28',
  '2026-01-29',
  '2026-01-30',
  '2026-01-31',
  '2026-02-01',
  '2026-02-28',
  '2026-04-04',
  '2026-04-05',
  '2026-05-01',
  '2026-06-19',
  '2026-09-28',
  '2026-10-10',
] as const;

export function toHolidayDateSet(
  dates?: Iterable<string> | null
): Set<string> {
  if (dates) return new Set(dates);
  return new Set(FALLBACK_TAIWAN_HOLIDAYS_2026);
}

export function isNationalHolidayDate(
  date: string | undefined,
  holidayDates: Set<string>
): boolean {
  return Boolean(date && holidayDates.has(date));
}

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
  scheduleEntries: Array<Pick<ScheduleEntry, 'shift_code'> & { date?: string }>;
  approvedOvertimes: Pick<OvertimeApplication, 'start_time' | 'end_time' | 'compensation'>[];
  approvedLeaves: Pick<LeaveApplication, 'period'>[];
  /** 國定假日期（YYYY-MM-DD）。建議傳入 holidays 表資料；未傳則用後備清單 */
  holidayDates?: Iterable<string>;
}

/**
 * 計算員工月度工時統計。
 *
 * 計算邏輯：
 * - workDays:       班別代碼不為 'X' 的條目數量
 * - workHours:      各班別代碼對應時數的總和
 * - overtimeHours:  compensation === 'pay' 的加班申請時數 + 國定假日排班工時
 * - compLeaveHours: compensation === 'comp_leave' 的加班申請時數總和
 * - leaveHours:     全天假 8 小時，半天假 4 小時的總和
 *
 * @param params - MonthlyStatsParams
 * @returns MonthlyStats（所有時數精確至小數點後兩位）
 */
export function calculateMonthlyStats(params: MonthlyStatsParams): MonthlyStats {
  const {
    userId,
    year,
    month,
    scheduleEntries,
    approvedOvertimes,
    approvedLeaves,
    holidayDates,
  } = params;

  const holidaySet = toHolidayDateSet(holidayDates ?? null);

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

  // 國定假日排班直接視為加班費時數（來源：holidayDates／holidays 表）
  const holidayOvertimeHoursRaw = scheduleEntries
    .filter((e) => e.shift_code !== 'X' && isNationalHolidayDate(e.date, holidaySet))
    .reduce((sum, e) => sum + (SHIFT_HOURS[e.shift_code] ?? 0), 0);

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
    workHours: Number(workHoursRaw.toFixed(2)),
    overtimeHours: Number((overtimeHoursRaw + holidayOvertimeHoursRaw).toFixed(2)),
    compLeaveHours: Number(compLeaveHoursRaw.toFixed(2)),
    leaveHours: Number(leaveHoursRaw.toFixed(2)),
  };
}
