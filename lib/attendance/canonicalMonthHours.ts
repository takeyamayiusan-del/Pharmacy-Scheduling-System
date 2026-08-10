/**
 * 結薪／工時統計共用：請假與上班時數的權威計算。
 *
 * 重要原則（核准後班表已被改寫）：
 * - 上班時數 = 目前班表時數（已是請假後剩餘），不可再扣一次請假
 * - 請假時數 = 優先用申請當下存的 leaveHours；跨月才依「請假前班別」逐日重算
 */

import { SHIFT_HOURS } from "@/lib/attendance/calculator";
import {
  calculateLeaveWorkHours,
  type LeavePeriod,
} from "@/lib/attendance/leaveHours";
import { roundCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";
import { getOriginalShiftForLeaveDay } from "@/lib/schedule/leaveSchedule";
import type { ScheduleSnapshotEntry } from "@/lib/schedule/scheduleSnapshot";
import type { ScheduleShiftCode, ShiftTimeConfig } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";
import { isOffShiftCode, findCatalogShift, resolveShiftTimeRanges } from "@/lib/shift-catalog/resolve";

export type CanonicalLeaveRequest = {
  employeeId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  period: LeavePeriod;
  shiftMode: "schedule" | ScheduleShiftCode;
  status: string;
  type?: string;
  leaveHours?: number;
  scheduleSnapshot?: ScheduleSnapshotEntry[];
};

function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function monthBounds(year: number, month: number) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    monthStart: `${monthStr}-01`,
    monthEnd: `${monthStr}-${String(lastDay).padStart(2, "0")}`,
    daysInMonth: lastDay,
    monthStr,
  };
}

function sumRangeHours(ranges: string[] | undefined): number {
  if (!ranges?.length) return 0;
  let minutes = 0;
  for (const seg of ranges) {
    if (seg === "休假" || !seg.includes("-")) continue;
    const [start, end] = seg.split("-");
    const [sh, sm] = start.trim().split(":").map(Number);
    const [eh, em] = end.trim().split(":").map(Number);
    minutes += eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
  }
  return minutes > 0 ? roundCompLeaveHours(minutes / 60) : 0;
}

/** 由班別時段／目錄加總工時；無設定時退回 SHIFT_HOURS */
export function getShiftWorkHours(
  shift: ScheduleShiftCode,
  shiftTimeConfig?: ShiftTimeConfig,
  storeConfig?: StoreConfig
): number {
  if (storeConfig ? isOffShiftCode(shift, storeConfig) : shift === "X") return 0;

  // 集進階目錄：全日表定工時優先用 nominalHours（與範本一致，避免含休息的大段被加總成毛工時）
  if (storeConfig?.features.customShiftCatalog) {
    const cat = findCatalogShift(storeConfig, shift);
    if (cat) {
      if (cat.category === "off") return 0;
      if (Number.isFinite(cat.nominalHours) && cat.nominalHours > 0) {
        return roundCompLeaveHours(cat.nominalHours);
      }
    }
  }

  const ranges =
    storeConfig && shiftTimeConfig
      ? resolveShiftTimeRanges(shift, storeConfig, shiftTimeConfig)
      : shiftTimeConfig?.[shift];
  const fromRanges = sumRangeHours(ranges);
  if (fromRanges > 0) return fromRanges;

  // 後備：與預設時段對齊（E 為 5.5、A 為 9）
  const fallback: Record<string, number> = {
    A: 9,
    B: 8,
    C: 3.5,
    D: 4.5,
    E: 5.5,
    X: 0,
  };
  return fallback[shift] ?? SHIFT_HOURS[shift] ?? 0;
}

/**
 * 單筆請假落在指定月份的時數（結薪／統計權威）。
 * - 整段都在本月且有 leaveHours → 用存檔時數（申請當下依請假前班別算好的）
 * - 否則依 snapshot／shiftMode 還原請假前班別逐日重算
 */
export function getApprovedLeaveHoursInMonth(params: {
  request: CanonicalLeaveRequest;
  year: number;
  month: number;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  shiftTimeConfig: ShiftTimeConfig;
  storeConfig?: StoreConfig;
}): number {
  const { request, year, month, getShiftForDate, shiftTimeConfig, storeConfig } =
    params;
  if (request.status !== "approved") return 0;

  const { monthStart, monthEnd } = monthBounds(year, month);
  if (request.endDate < monthStart || request.startDate > monthEnd) return 0;

  const whollyInMonth =
    request.startDate >= monthStart && request.endDate <= monthEnd;
  if (whollyInMonth && request.leaveHours && request.leaveHours > 0) {
    return roundCompLeaveHours(request.leaveHours);
  }

  const rangeStart = request.startDate < monthStart ? monthStart : request.startDate;
  const rangeEnd = request.endDate > monthEnd ? monthEnd : request.endDate;

  const resolveShift = (date: string, employeeId: string): ScheduleShiftCode =>
    getOriginalShiftForLeaveDay({
      employeeId,
      date,
      shiftMode: request.shiftMode,
      scheduleSnapshot: request.scheduleSnapshot,
      getBaseShiftForDate: getShiftForDate,
    });

  return calculateLeaveWorkHours({
    startDate: rangeStart,
    endDate: rangeEnd,
    startTime: request.startTime,
    endTime: request.endTime,
    period: request.period,
    shiftMode: "schedule",
    employeeId: request.employeeId,
    getShiftForDate: resolveShift,
    shiftTimeConfig,
    storeConfig,
  });
}

export function sumApprovedLeaveHoursInMonth(params: {
  employeeId: string;
  year: number;
  month: number;
  leaveRequests: CanonicalLeaveRequest[];
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  shiftTimeConfig: ShiftTimeConfig;
  storeConfig?: StoreConfig;
  /** 若提供，只加總這些假別；預設全部 */
  excludeTypes?: string[];
}): number {
  const exclude = new Set(params.excludeTypes ?? []);
  const total = params.leaveRequests
    .filter(
      (r) =>
        r.employeeId === params.employeeId &&
        r.status === "approved" &&
        (!r.type || !exclude.has(r.type))
    )
    .reduce(
      (sum, request) =>
        sum +
        getApprovedLeaveHoursInMonth({
          request,
          year: params.year,
          month: params.month,
          getShiftForDate: params.getShiftForDate,
          shiftTimeConfig: params.shiftTimeConfig,
          storeConfig: params.storeConfig,
        }),
      0
    );
  return roundCompLeaveHours(total);
}

/**
 * 月上班時數（與薪資一致）：
 * 用「目前班表」時數加總——核准請假後班表已是剩餘工時，不可再扣請假。
 */
export function computeMonthWorkHoursFromSchedule(params: {
  employeeId: string;
  year: number;
  month: number;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  getHolidayInfo: (date: string) => { isHoliday: boolean };
  shiftTimeConfig: ShiftTimeConfig;
  storeConfig?: StoreConfig;
}): {
  workDays: number;
  workHours: number;
  holidayOvertimeHours: number;
} {
  const {
    employeeId,
    year,
    month,
    getShiftForDate,
    getHolidayInfo,
    shiftTimeConfig,
    storeConfig,
  } = params;
  const { daysInMonth, monthStr } = monthBounds(year, month);

  let workDays = 0;
  let workHours = 0;
  let holidayOvertimeHours = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
    const shift = getShiftForDate(dateStr, employeeId);
    if (storeConfig ? isOffShiftCode(shift, storeConfig) : shift === "X") continue;
    const hours = getShiftWorkHours(shift, shiftTimeConfig, storeConfig);
    workDays += 1;
    workHours += hours;
    if (getHolidayInfo(dateStr).isHoliday) {
      holidayOvertimeHours += hours;
    }
  }

  return {
    workDays,
    workHours: roundCompLeaveHours(workHours),
    holidayOvertimeHours: roundCompLeaveHours(holidayOvertimeHours),
  };
}

export { enumerateDates, monthBounds };
