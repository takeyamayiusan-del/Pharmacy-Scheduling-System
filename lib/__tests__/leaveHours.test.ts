import { describe, expect, it } from "vitest";
import { calculateLeaveWorkHours } from "@/lib/attendance/leaveHours";
import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";

const shiftTimeConfig: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

describe("calculateLeaveWorkHours", () => {
  it("兩天 B 班全天請假應為 16 小時", () => {
    const getShiftForDate = () => "B" as ShiftType;
    const hours = calculateLeaveWorkHours({
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      startTime: "08:30",
      endTime: "18:00",
      period: "full_day",
      shiftMode: "B",
      employeeId: "e1",
      getShiftForDate,
      shiftTimeConfig,
    });
    expect(hours).toBe(16);
  });
});
