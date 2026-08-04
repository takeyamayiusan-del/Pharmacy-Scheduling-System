import { describe, expect, it } from "vitest";
import {
  getDefaultPayrollPeriod,
  computeMonthlyAttendanceHours,
} from "./monthlyHours";
import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";

const shiftTimeConfig: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

describe("getDefaultPayrollPeriod", () => {
  it("defaults to previous month (Aug → Jul)", () => {
    expect(getDefaultPayrollPeriod(new Date(2026, 7, 4))).toEqual({
      year: 2026,
      month: 7,
    });
  });

  it("rolls year when January", () => {
    expect(getDefaultPayrollPeriod(new Date(2026, 0, 15))).toEqual({
      year: 2025,
      month: 12,
    });
  });
});

describe("computeMonthlyAttendanceHours", () => {
  it("imports schedule work hours, leave, OT pay and holiday OT", () => {
    const getShiftForDate = (date: string, _employeeId: string): ShiftType => {
      if (date === "2026-07-04") return "X";
      if (date === "2026-07-01") return "A"; // holiday work
      return date.endsWith("-05") ? "A" : "X";
    };
    const getHolidayInfo = (date: string) => ({
      isHoliday: date === "2026-07-01",
    });

    const result = computeMonthlyAttendanceHours({
      employeeId: "e1",
      year: 2026,
      month: 7,
      getShiftForDate,
      getHolidayInfo,
      shiftTimeConfig,
      leaveRequests: [
        {
          employeeId: "e1",
          startDate: "2026-07-05",
          endDate: "2026-07-05",
          startTime: "08:30",
          endTime: "12:00",
          period: "morning",
          shiftMode: "schedule",
          status: "approved",
          type: "事假",
        },
      ],
      overtimeRequests: [
        {
          employeeId: "e1",
          date: "2026-07-05",
          startTime: "18:00",
          endTime: "20:00",
          status: "approved",
          compensationType: "pay",
        },
      ],
    });

    // 7/1 A on holiday: SHIFT_HOURS A=8 → holiday OT 8、work 8
    // 7/5 A morning leave 3.5h → credited 4.5
    expect(result.holidayOvertimeHours).toBe(8);
    expect(result.workHours).toBe(12.5);
    expect(result.overtimePayHours).toBe(2);
    expect(result.leaveDeductionHours).toBe(3.5);
  });
});
