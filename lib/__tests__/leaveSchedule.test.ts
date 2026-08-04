import { describe, expect, it } from "vitest";
import {
  calculateLeaveDisplayOnSchedule,
  getOriginalShiftForLeaveDay,
  resolveLeaveTimesForSchedule,
} from "@/lib/schedule/leaveSchedule";

describe("leaveSchedule", () => {
  it("上午請假使用固定時段", () => {
    expect(resolveLeaveTimesForSchedule({ period: "morning", startTime: "09:00", endTime: "11:00" })).toEqual({
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
