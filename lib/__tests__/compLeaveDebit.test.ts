import { describe, expect, it } from "vitest";
import {
  buildCompLeaveDebitNote,
  resolveCompLeaveDebitHours,
} from "@/lib/attendance/compLeaveDebit";

describe("compLeaveDebit", () => {
  it("優先使用申請 leave_hours", () => {
    expect(resolveCompLeaveDebitHours({ leaveHours: 3.5, period: "full_day" })).toBe(3.5);
  });

  it("leave_hours 為 0／空時依時段推估", () => {
    expect(resolveCompLeaveDebitHours({ leaveHours: 0, period: "full_day" })).toBe(8);
    expect(resolveCompLeaveDebitHours({ leaveHours: null, period: "morning" })).toBe(4);
    expect(
      resolveCompLeaveDebitHours({ leaveHours: 0, period: "afternoon", leaveHoursPerDay: 9 })
    ).toBe(4.5);
  });

  it("備註區分補登／一般", () => {
    expect(
      buildCompLeaveDebitNote({
        isAdvance: false,
        startDate: "2026-08-01",
        endDate: "2026-08-01",
      })
    ).toMatch(/請假使用補休/);
    expect(
      buildCompLeaveDebitNote({
        isAdvance: true,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
        backfill: true,
      })
    ).toMatch(/補登.*借支/);
  });
});
