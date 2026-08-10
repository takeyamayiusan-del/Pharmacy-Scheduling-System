import { roundCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";
import {
  computeMonthWorkHoursFromSchedule,
  sumApprovedLeaveHoursInMonth,
  type CanonicalLeaveRequest,
} from "@/lib/attendance/canonicalMonthHours";
import type { ScheduleShiftCode, ShiftTimeConfig } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";

export type PayrollLeaveLike = CanonicalLeaveRequest;

export type PayrollOvertimeLike = {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  compensationType: "pay" | "time_off";
};

/** 結薪預設期間：上個月（八月算七月） */
export function getDefaultPayrollPeriod(now = new Date()): { year: number; month: number } {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function overtimeHoursBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const mins = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
  return Math.max(0, mins) / 60;
}

export type MonthlyAttendanceHours = {
  workDays: number;
  /** 班表應出勤工時（核准請假後班表已是剩餘，不再重扣請假） */
  workHours: number;
  /** 核准加班且選加班費 */
  overtimePayHours: number;
  /** 國定假日排班工時（視為加班） */
  holidayOvertimeHours: number;
  /** 核准加班且選補休 */
  compensatoryHours: number;
  /** 核准請假時數（不含補休假，供扣款） */
  leaveDeductionHours: number;
  /** 全部核准請假時數（含補休，供顯示） */
  leaveHoursTotal: number;
};

/**
 * 與出勤統計／薪資試算共用的月工時彙總（權威入口）。
 */
export function computeMonthlyAttendanceHours(params: {
  employeeId: string;
  year: number;
  month: number;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  getHolidayInfo: (date: string) => { isHoliday: boolean };
  shiftTimeConfig: ShiftTimeConfig;
  leaveRequests: PayrollLeaveLike[];
  overtimeRequests: PayrollOvertimeLike[];
  storeConfig?: StoreConfig;
}): MonthlyAttendanceHours {
  const { employeeId, year, month } = params;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  const schedule = computeMonthWorkHoursFromSchedule({
    employeeId,
    year,
    month,
    getShiftForDate: params.getShiftForDate,
    getHolidayInfo: params.getHolidayInfo,
    shiftTimeConfig: params.shiftTimeConfig,
    storeConfig: params.storeConfig,
  });

  const empOt = params.overtimeRequests.filter(
    (r) =>
      r.employeeId === employeeId &&
      r.status === "approved" &&
      r.date >= startDate &&
      r.date <= endDate
  );

  const overtimePayHours = empOt
    .filter((r) => r.compensationType === "pay")
    .reduce((sum, r) => sum + overtimeHoursBetween(r.startTime, r.endTime), 0);

  const compensatoryHours = empOt
    .filter((r) => r.compensationType === "time_off")
    .reduce((sum, r) => sum + overtimeHoursBetween(r.startTime, r.endTime), 0);

  const leaveHoursTotal = sumApprovedLeaveHoursInMonth({
    employeeId,
    year,
    month,
    leaveRequests: params.leaveRequests,
    getShiftForDate: params.getShiftForDate,
    shiftTimeConfig: params.shiftTimeConfig,
    storeConfig: params.storeConfig,
  });

  const leaveDeductionHours = sumApprovedLeaveHoursInMonth({
    employeeId,
    year,
    month,
    leaveRequests: params.leaveRequests,
    getShiftForDate: params.getShiftForDate,
    shiftTimeConfig: params.shiftTimeConfig,
    storeConfig: params.storeConfig,
    excludeTypes: ["補休假"],
  });

  return {
    workDays: schedule.workDays,
    workHours: schedule.workHours,
    overtimePayHours: roundCompLeaveHours(overtimePayHours),
    holidayOvertimeHours: schedule.holidayOvertimeHours,
    compensatoryHours: roundCompLeaveHours(compensatoryHours),
    leaveDeductionHours,
    leaveHoursTotal,
  };
}
