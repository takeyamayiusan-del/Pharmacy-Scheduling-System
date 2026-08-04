import type { ShiftType } from "@/lib/context/AppContext";
import { calculateEffectiveShift } from "@/lib/schedule/effectiveShift";
import type { ScheduleSnapshotEntry } from "@/lib/schedule/scheduleSnapshot";

export type LeavePeriodMode = "full_day" | "morning" | "afternoon" | "custom";

export function resolveLeaveTimesForSchedule(input: {
  period: LeavePeriodMode;
  startTime: string;
  endTime: string;
}): { startTime: string; endTime: string } {
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
  shiftMode: "schedule" | ShiftType;
  scheduleSnapshot?: ScheduleSnapshotEntry[];
  getBaseShiftForDate: (date: string, employeeId: string) => ShiftType;
}): ShiftType {
  const snap = input.scheduleSnapshot?.find(
    (entry) => entry.userId === input.employeeId && entry.date === input.date
  );
  if (snap?.shift) return snap.shift;
  if (input.shiftMode !== "schedule") return input.shiftMode;
  return input.getBaseShiftForDate(input.date, input.employeeId);
}

export function calculateLeaveDisplayOnSchedule(
  originalShift: ShiftType,
  period: LeavePeriodMode,
  startTime: string,
  endTime: string
): {
  effectiveShift: ShiftType;
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
  const effectiveShift = (result.shift ?? "X") as ShiftType;

  return {
    effectiveShift,
    effectiveShiftDetails: result.details,
    isPartialLeave: result.isPartial && effectiveShift !== "X",
    leaveStartTime,
    leaveEndTime,
  };
}
