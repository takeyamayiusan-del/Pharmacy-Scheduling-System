import { SHIFT_HOURS } from "@/lib/attendance/calculator";
import {
  calculateApprovedLeaveHoursOnDate,
  calculateApprovedLeaveHoursTotal,
} from "@/lib/attendance/leaveHours";
import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";

export type PayrollLeaveLike = {
  employeeId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  period: "full_day" | "morning" | "afternoon" | "custom";
  shiftMode: "schedule" | ShiftType;
  status: string;
  type?: string;
  leaveHours?: number;
};

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
  /** 班表應出勤工時（已扣當日核准請假） */
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
 * 與出勤統計一致：依班表＋請假＋加班申請彙總月工時，供薪資試算匯入。
 */
export function computeMonthlyAttendanceHours(params: {
  employeeId: string;
  year: number;
  month: number;
  getShiftForDate: (date: string, employeeId: string) => ShiftType;
  getHolidayInfo: (date: string) => { isHoliday: boolean };
  shiftTimeConfig: ShiftTimeConfig;
  leaveRequests: PayrollLeaveLike[];
  overtimeRequests: PayrollOvertimeLike[];
}): MonthlyAttendanceHours {
  const { employeeId, year, month } = params;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${monthStr}-01`;
  const endDate = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  let workDays = 0;
  let workHours = 0;
  let holidayOvertimeHours = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
    const shift = params.getShiftForDate(dateStr, employeeId);
    const shiftHours = SHIFT_HOURS[shift] ?? 0;
    const leaveHoursOnDay = calculateApprovedLeaveHoursOnDate(
      dateStr,
      employeeId,
      params.leaveRequests as Parameters<typeof calculateApprovedLeaveHoursOnDate>[2],
      params.getShiftForDate,
      params.shiftTimeConfig
    );
    const credited = Math.max(0, shiftHours - leaveHoursOnDay);

    if (shift !== "X" && leaveHoursOnDay < shiftHours) {
      workDays += 1;
      if (params.getHolidayInfo(dateStr).isHoliday) {
        holidayOvertimeHours += credited;
      }
    }
    workHours += credited;
  }

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

  const approvedLeaves = params.leaveRequests.filter(
    (r) =>
      r.employeeId === employeeId &&
      r.status === "approved" &&
      r.endDate >= startDate &&
      r.startDate <= endDate
  );

  const leaveHoursTotal = approvedLeaves.reduce(
    (sum, r) =>
      sum +
      calculateApprovedLeaveHoursTotal(
        r as Parameters<typeof calculateApprovedLeaveHoursTotal>[0],
        params.getShiftForDate,
        params.shiftTimeConfig
      ),
    0
  );

  const leaveDeductionHours = approvedLeaves
    .filter((r) => r.type !== "補休假")
    .reduce(
      (sum, r) =>
        sum +
        calculateApprovedLeaveHoursTotal(
          r as Parameters<typeof calculateApprovedLeaveHoursTotal>[0],
          params.getShiftForDate,
          params.shiftTimeConfig
        ),
      0
    );

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    workDays,
    workHours: round2(workHours),
    overtimePayHours: round2(overtimePayHours),
    holidayOvertimeHours: round2(holidayOvertimeHours),
    compensatoryHours: round2(compensatoryHours),
    leaveDeductionHours: round2(leaveDeductionHours),
    leaveHoursTotal: round2(leaveHoursTotal),
  };
}
