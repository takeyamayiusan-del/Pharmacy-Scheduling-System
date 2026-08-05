import { describe, expect, it } from "vitest";
import {
  buildCompLeaveMonthSummary,
  buildLeaveBreakdownInMonth,
  formatLeaveBreakdownText,
} from "@/lib/attendance/monthlyStatsView";
import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";

const shiftTimeConfig: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

describe("monthlyStatsView", () => {
  it("breaks leave down by type within month", () => {
    const getShiftForDate = (): ShiftType => "B";
    const result = buildLeaveBreakdownInMonth({
      employeeId: "e1",
      year: 2026,
      month: 7,
      getShiftForDate,
      shiftTimeConfig,
      leaveRequests: [
        {
          employeeId: "e1",
          startDate: "2026-07-10",
          endDate: "2026-07-10",
          startTime: "08:30",
          endTime: "18:00",
          period: "full_day",
          shiftMode: "schedule",
          status: "approved",
          type: "事假",
        },
        {
          employeeId: "e1",
          startDate: "2026-07-11",
          endDate: "2026-07-11",
          startTime: "08:30",
          endTime: "12:00",
          period: "morning",
          shiftMode: "schedule",
          status: "approved",
          type: "補休假",
        },
      ],
    });

    expect(result.byType.map((x) => x.type).sort()).toEqual(["事假", "補休假"].sort());
    expect(result.totalHours).toBe(8 + 3.5);
    expect(result.byType.find((x) => x.type === "事假")?.hours).toBe(8);
    expect(result.byType.find((x) => x.type === "補休假")?.hours).toBe(3.5);
    expect(formatLeaveBreakdownText(result.byType)).toContain("事假");
  });

  it("uses stored leaveHours even when current schedule is already X", () => {
    const getShiftForDate = (): ShiftType => "X";
    const result = buildLeaveBreakdownInMonth({
      employeeId: "e1",
      year: 2026,
      month: 7,
      getShiftForDate,
      shiftTimeConfig,
      leaveRequests: [
        {
          employeeId: "e1",
          startDate: "2026-07-10",
          endDate: "2026-07-10",
          startTime: "08:30",
          endTime: "18:00",
          period: "full_day",
          shiftMode: "schedule",
          status: "approved",
          type: "事假",
          leaveHours: 8,
        },
      ],
    });
    expect(result.totalHours).toBe(8);
  });

  it("summarizes comp leave earn/use and negative balance hint", () => {
    const summary = buildCompLeaveMonthSummary({
      employeeId: "e1",
      year: 2026,
      month: 7,
      currentBalance: -2,
      ledger: [
        {
          employeeId: "e1",
          hours: 4,
          sourceType: "overtime_credit",
          createdAt: "2026-07-05T10:00:00.000Z",
        },
        {
          employeeId: "e1",
          hours: -6,
          sourceType: "leave_debit",
          createdAt: "2026-07-08T10:00:00.000Z",
        },
      ],
    });

    expect(summary.earnedHours).toBe(4);
    expect(summary.usedHours).toBe(6);
    expect(summary.netHours).toBe(-2);
    expect(summary.balance).toBe(-2);
    expect(summary.hint).toContain("借支");
  });
});
