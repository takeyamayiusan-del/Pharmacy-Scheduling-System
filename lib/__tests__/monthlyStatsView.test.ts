import { describe, expect, it } from "vitest";
import {
  buildCompLeaveMonthSummary,
  buildLeaveBreakdownInMonth,
  formatLeaveBreakdownText,
  resolveCompLedgerEventDate,
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
      overtimeRequests: [{ id: "ot1", employeeId: "e1", date: "2026-07-05" }],
      leaveRequests: [
        { id: "lv1", employeeId: "e1", startDate: "2026-07-08", endDate: "2026-07-08" },
      ],
      ledger: [
        {
          employeeId: "e1",
          hours: 4,
          sourceType: "overtime_credit",
          sourceId: "ot1",
          createdAt: "2026-08-01T10:00:00.000Z", // 審核在八月，仍歸七月加班日
        },
        {
          employeeId: "e1",
          hours: -6,
          sourceType: "leave_debit",
          sourceId: "lv1",
          createdAt: "2026-08-02T10:00:00.000Z",
        },
      ],
    });

    expect(summary.earnedHours).toBe(4);
    expect(summary.usedHours).toBe(6);
    expect(summary.overtimeCreditHours).toBe(4);
    expect(summary.leaveDebitHours).toBe(6);
    expect(summary.balance).toBe(-2);
    expect(summary.hint).toContain("借支");
  });

  it("does not count leave refund / typhoon / adjustment as raw positive dump into earned equally", () => {
    const summary = buildCompLeaveMonthSummary({
      employeeId: "e1",
      year: 2026,
      month: 7,
      currentBalance: 4.38,
      overtimeRequests: [{ id: "ot1", employeeId: "e1", date: "2026-07-03" }],
      leaveRequests: [
        { id: "lv1", employeeId: "e1", startDate: "2026-07-07", endDate: "2026-07-07" },
      ],
      ledger: [
        {
          employeeId: "e1",
          hours: 3.23,
          sourceType: "overtime_credit",
          sourceId: "ot1",
          note: "加班轉補休 2026-07-03",
          createdAt: "2026-07-04T02:00:00.000Z",
        },
        {
          employeeId: "e1",
          hours: 8,
          sourceType: "typhoon_credit",
          note: "颱風日（2026-07-02）出勤補休獎勵",
          createdAt: "2026-07-03T02:00:00.000Z",
        },
        {
          employeeId: "e1",
          hours: 9.42,
          sourceType: "adjustment",
          note: "店長核發補休",
          createdAt: "2026-07-10T02:00:00.000Z",
        },
        {
          employeeId: "e1",
          hours: 4.5,
          sourceType: "reversal",
          sourceId: "lv-old",
          note: "請假審核取消，補休時數退回",
          createdAt: "2026-07-15T02:00:00.000Z",
        },
        {
          employeeId: "e1",
          hours: -4.5,
          sourceType: "leave_debit",
          sourceId: "lv1",
          createdAt: "2026-07-07T02:00:00.000Z",
        },
        {
          employeeId: "e1",
          hours: -14.5,
          sourceType: "adjustment",
          note: "店長扣回",
          createdAt: "2026-07-20T02:00:00.000Z",
        },
      ],
    });

    // 賺得 = 加班 3.23 + 颱風 8 + 手動 9.42 = 20.65（退回不算賺得）
    expect(summary.earnedHours).toBe(20.65);
    expect(summary.overtimeCreditHours).toBe(3.23);
    expect(summary.typhoonCreditHours).toBe(8);
    expect(summary.adjustmentCreditHours).toBe(9.42);
    expect(summary.leaveRefundHours).toBe(4.5);
    // 使用 = 補休 4.5 + 手動扣 14.5 = 19
    expect(summary.usedHours).toBe(19);
    expect(summary.leaveDebitHours).toBe(4.5);
    expect(summary.adjustmentDebitHours).toBe(14.5);
  });

  it("resolves event date from overtime sourceId over createdAt", () => {
    const date = resolveCompLedgerEventDate(
      {
        employeeId: "e1",
        hours: 2,
        sourceType: "overtime_credit",
        sourceId: "ot1",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      new Map([["ot1", { id: "ot1", employeeId: "e1", date: "2026-07-20" }]])
    );
    expect(date).toBe("2026-07-20");
  });
});
