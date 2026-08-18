import type { ScheduleShiftCode } from "@/lib/context/AppContext";
import { calculateEffectiveShift } from "@/lib/schedule/effectiveShift";
import type { ScheduleSnapshotEntry } from "@/lib/schedule/scheduleSnapshot";
import { normalizeCalendarDate } from "@/lib/schedule/sundayRest";

export type LeavePeriodMode = "full_day" | "morning" | "afternoon" | "custom";

export function resolveLeaveTimesForSchedule(input: {
  period: LeavePeriodMode;
  startTime: string;
  endTime: string;
}): { startTime: string; endTime: string } {
  // 申請當下已依班表時段存好 start/end；寫入班表必須用這組，不可改回寫死的 08:30
  if (input.period !== "full_day" && input.startTime && input.endTime) {
    return { startTime: input.startTime, endTime: input.endTime };
  }
  if (input.period === "morning") {
    return { startTime: "08:30", endTime: "12:00" };
  }
  if (input.period === "afternoon") {
    return { startTime: "13:30", endTime: "18:00" };
  }
  return { startTime: input.startTime, endTime: input.endTime };
}

export function getOriginalShiftForLeaveDay(input: {
  employeeId: string;
  date: string;
  shiftMode: "schedule" | ScheduleShiftCode;
  scheduleSnapshot?: ScheduleSnapshotEntry[];
  getBaseShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
}): ScheduleShiftCode {
  const date = normalizeCalendarDate(input.date);
  const snap = input.scheduleSnapshot?.find(
    (entry) =>
      entry.userId === input.employeeId && normalizeCalendarDate(entry.date) === date
  );
  if (snap?.shift) return snap.shift;
  if (input.shiftMode !== "schedule") return input.shiftMode;
  return input.getBaseShiftForDate(date || input.date, input.employeeId);
}

export function calculateLeaveDisplayOnSchedule(
  originalShift: ScheduleShiftCode,
  period: LeavePeriodMode,
  startTime: string,
  endTime: string
): {
  effectiveShift: ScheduleShiftCode;
  effectiveShiftDetails: string;
  isPartialLeave: boolean;
  leaveStartTime: string;
  leaveEndTime: string;
} {
  const { startTime: leaveStartTime, endTime: leaveEndTime } = resolveLeaveTimesForSchedule({
    period,
    startTime,
    endTime,
  });

  if (period === "full_day") {
    return {
      effectiveShift: "X",
      effectiveShiftDetails: "全日請假",
      isPartialLeave: false,
      leaveStartTime,
      leaveEndTime,
    };
  }

  const result = calculateEffectiveShift(originalShift, leaveStartTime, leaveEndTime);
  const effectiveShift = result.shift ?? "X";

  return {
    effectiveShift,
    effectiveShiftDetails: result.details,
    isPartialLeave: result.isPartial && effectiveShift !== "X",
    leaveStartTime,
    leaveEndTime,
  };
}

/** 請假顯示用精簡形狀，避免與 AppContext 循環依賴 */
export type LeaveRequestForDisplay = {
  employeeId: string;
  startDate: string;
  endDate: string;
  status: string;
  period: LeavePeriodMode;
  startTime: string;
  endTime: string;
  type?: string;
  shiftMode: "schedule" | ScheduleShiftCode;
  scheduleSnapshot?: ScheduleSnapshotEntry[];
};

export type OvertimeRequestForDisplay = {
  employeeId: string;
  date: string;
  status: string;
  startTime: string;
  endTime: string;
};

export type DisplayedShiftInfo = {
  originalShift: ScheduleShiftCode;
  effectiveShift: ScheduleShiftCode;
  effectiveShiftDetails: string;
  hasLeave: boolean;
  isPartialLeave: boolean;
  hasOvertime: boolean;
  leaveType?: string;
  leaveStartTime?: string;
  leaveEndTime?: string;
  overtimeInfo: { startTime: string; endTime: string } | null;
};

/**
 * 月曆式／個人班表共用現身班別：已核准請假以請假結果為準（全日顯示休假）。
 */
export function getDisplayedShiftInfo(input: {
  date: string;
  employeeId: string;
  originalShift: ScheduleShiftCode;
  leaveRequests: LeaveRequestForDisplay[];
  overtimeRequests?: OvertimeRequestForDisplay[];
  getBaseShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
}): DisplayedShiftInfo {
  const date = normalizeCalendarDate(input.date);
  const originalShift = input.originalShift;

  const approvedLeave = input.leaveRequests.find((req) => {
    if (req.employeeId !== input.employeeId || req.status !== "approved") return false;
    const start = normalizeCalendarDate(req.startDate);
    const end = normalizeCalendarDate(req.endDate);
    return Boolean(start && end && start <= date && end >= date);
  });

  const approvedOvertime = (input.overtimeRequests ?? []).find(
    (req) =>
      req.employeeId === input.employeeId &&
      normalizeCalendarDate(req.date) === date &&
      req.status === "approved"
  );

  const overtimeInfo = approvedOvertime
    ? { startTime: approvedOvertime.startTime, endTime: approvedOvertime.endTime }
    : null;

  if (!approvedLeave) {
    return {
      originalShift,
      effectiveShift: originalShift,
      effectiveShiftDetails: "",
      hasLeave: false,
      isPartialLeave: false,
      hasOvertime: !!approvedOvertime,
      leaveType: undefined,
      leaveStartTime: undefined,
      leaveEndTime: undefined,
      overtimeInfo,
    };
  }

  const baseShift = getOriginalShiftForLeaveDay({
    employeeId: input.employeeId,
    date,
    shiftMode: approvedLeave.shiftMode,
    scheduleSnapshot: approvedLeave.scheduleSnapshot,
    getBaseShiftForDate: input.getBaseShiftForDate,
  });
  const leaveDisplay = calculateLeaveDisplayOnSchedule(
    baseShift,
    approvedLeave.period,
    approvedLeave.startTime,
    approvedLeave.endTime
  );

  return {
    originalShift: baseShift,
    effectiveShift: leaveDisplay.effectiveShift,
    effectiveShiftDetails: leaveDisplay.effectiveShiftDetails,
    hasLeave: true,
    isPartialLeave: leaveDisplay.isPartialLeave,
    hasOvertime: !!approvedOvertime,
    leaveType: approvedLeave.type,
    leaveStartTime: leaveDisplay.leaveStartTime,
    leaveEndTime: leaveDisplay.leaveEndTime,
    overtimeInfo,
  };
}
