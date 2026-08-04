import { describe, expect, it } from "vitest";
import {
  calculateApprovedLeaveHoursOnDate,
  calculateLeaveWorkHours,
} from "@/lib/attendance/leaveHours";
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

  it("半天請假只應扣當日上午時數", () => {
    const getShiftForDate = () => "B" as ShiftType;
    const leaveRequests = [
      {
        employeeId: "e1",
        startDate: "2026-06-01",
        endDate: "2026-06-01",
        startTime: "08:30",
        endTime: "12:00",
        period: "morning" as const,
        shiftMode: "schedule" as const,
        status: "approved",
        leaveHours: 3.5,
      },
    ];

    const leaveOnDay = calculateApprovedLeaveHoursOnDate(
      "2026-06-01",
      "e1",
      leaveRequests,
      getShiftForDate,
      shiftTimeConfig
    );

    expect(leaveOnDay).toBe(3.5);
    expect(8 - leaveOnDay).toBe(4.5);
  });
});
