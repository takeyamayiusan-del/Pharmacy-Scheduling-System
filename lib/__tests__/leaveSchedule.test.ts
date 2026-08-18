import { describe, expect, it } from "vitest";
import {
  calculateLeaveDisplayOnSchedule,
  getDisplayedShiftInfo,
  getOriginalShiftForLeaveDay,
  resolveLeaveTimesForSchedule,
} from "@/lib/schedule/leaveSchedule";

describe("leaveSchedule", () => {
  it("上午請假優先使用申請已存時段，不用寫死 08:30", () => {
    expect(resolveLeaveTimesForSchedule({ period: "morning", startTime: "09:00", endTime: "11:00" })).toEqual({
      startTime: "09:00",
      endTime: "11:00",
    });
  });

  it("沒有存時段時才退回預設上午／下午", () => {
    expect(resolveLeaveTimesForSchedule({ period: "morning", startTime: "", endTime: "" })).toEqual({
      startTime: "08:30",
      endTime: "12:00",
    });
  });

  it("以快照班別計算半日請假，而非請假後寫入的班別", () => {
    const baseShift = getOriginalShiftForLeaveDay({
      employeeId: "emp-1",
      date: "2026-07-10",
      shiftMode: "schedule",
      scheduleSnapshot: [
        { userId: "emp-1", date: "2026-07-10", shift: "A", hadDbEntry: false },
      ],
      getBaseShiftForDate: () => "D",
    });
    expect(baseShift).toBe("A");

    const display = calculateLeaveDisplayOnSchedule(baseShift, "morning", "08:30", "12:00");
    expect(display.isPartialLeave).toBe(true);
    expect(display.leaveStartTime).toBe("08:30");
    expect(display.leaveEndTime).toBe("12:00");
    expect(display.effectiveShift).not.toBe("A");
  });
});

describe("getDisplayedShiftInfo", () => {
  it("full-day approved leave overlays as rest, matching calendar display", () => {
    const info = getDisplayedShiftInfo({
      date: "2026-08-15",
      employeeId: "emp-1",
      originalShift: "B",
      getBaseShiftForDate: () => "B",
      leaveRequests: [
        {
          employeeId: "emp-1",
          startDate: "2026-08-15T00:00:00.000Z",
          endDate: "2026-08-15T00:00:00.000Z",
          status: "approved",
          period: "full_day",
          startTime: "08:30",
          endTime: "18:00",
          type: "特休",
          shiftMode: "schedule",
        },
      ],
    });
    expect(info.hasLeave).toBe(true);
    expect(info.effectiveShift).toBe("X");
    expect(info.isPartialLeave).toBe(false);
    expect(info.leaveType).toBe("特休");
  });

  it("does not overlay pending leave", () => {
    const info = getDisplayedShiftInfo({
      date: "2026-08-15",
      employeeId: "emp-1",
      originalShift: "B",
      getBaseShiftForDate: () => "B",
      leaveRequests: [
        {
          employeeId: "emp-1",
          startDate: "2026-08-15",
          endDate: "2026-08-15",
          status: "pending",
          period: "full_day",
          startTime: "08:30",
          endTime: "18:00",
          shiftMode: "schedule",
        },
      ],
    });
    expect(info.hasLeave).toBe(false);
    expect(info.effectiveShift).toBe("B");
  });
});
