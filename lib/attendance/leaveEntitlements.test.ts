import { describe, expect, it } from "vitest";
import {
  effectiveLeaveRule,
  leaveLimitWarnings,
  STATUTORY_LEAVE_RULES,
} from "@/lib/attendance/leaveEntitlements";
import { statutoryAnnualLeaveDays } from "@/lib/attendance/annualLeave";
import { LEAVE_TYPE_OPTIONS } from "@/lib/attendance/leaveHours";

describe("leaveEntitlements", () => {
  it("covers every leave type with a statutory rule", () => {
    for (const type of LEAVE_TYPE_OPTIONS) {
      expect(STATUTORY_LEAVE_RULES[type].type).toBe(type);
    }
    expect(STATUTORY_LEAVE_RULES["婚假"].daysLimit).toBe(8);
    expect(STATUTORY_LEAVE_RULES["婚假"].payKind).toBe("paid");
    expect(STATUTORY_LEAVE_RULES["事假"].daysLimit).toBe(14);
    expect(STATUTORY_LEAVE_RULES["事假"].payKind).toBe("unpaid");
    expect(STATUTORY_LEAVE_RULES["病假"].payKind).toBe("half");
    expect(STATUTORY_LEAVE_RULES["生理假"].daysLimit).toBe(1);
    expect(STATUTORY_LEAVE_RULES["陪產檢及陪產假"].daysLimit).toBe(7);
    expect(STATUTORY_LEAVE_RULES["產假"].daysLimit).toBe(56);
    expect(STATUTORY_LEAVE_RULES["公假"].payKind).toBe("paid");
  });

  it("store override changes days and pay without losing legal note", () => {
    const rule = effectiveLeaveRule("婚假", {
      婚假: { daysLimit: 10, payKind: "unpaid" },
    });
    expect(rule.daysLimit).toBe(10);
    expect(rule.payKind).toBe("unpaid");
    expect(rule.customized).toBe(true);
    expect(rule.legalRef).toContain("請假規則");
  });

  it("warns when personal leave exceeds 14 days but does not compute a hard block", () => {
    const warnings = leaveLimitWarnings({
      type: "事假",
      employeeId: "e1",
      startDate: "2026-08-01",
      addHours: 8,
      hoursPerDay: 8,
      requests: [
        {
          employeeId: "e1",
          type: "事假",
          status: "approved",
          startDate: "2026-01-01",
          endDate: "2026-01-14",
          leaveHours: 14 * 8,
        },
      ],
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].title).toContain("僅警示");
  });

  it("warns family-care plus personal against the combined 14-day cap", () => {
    const warnings = leaveLimitWarnings({
      type: "家庭照顧事假",
      employeeId: "e1",
      startDate: "2026-06-01",
      addHours: 8,
      hoursPerDay: 8,
      requests: [
        {
          employeeId: "e1",
          type: "事假",
          status: "approved",
          startDate: "2026-02-01",
          endDate: "2026-02-10",
          leaveHours: 10 * 8,
        },
        {
          employeeId: "e1",
          type: "家庭照顧事假",
          status: "pending",
          startDate: "2026-03-01",
          endDate: "2026-03-04",
          leaveHours: 4 * 8,
        },
      ],
    });
    expect(warnings.some((w) => w.title.includes("14日"))).toBe(true);
  });
});

describe("statutoryAnnualLeaveDays", () => {
  it("follows Labor Standards Act article 38", () => {
    expect(statutoryAnnualLeaveDays(5)).toBe(0);
    expect(statutoryAnnualLeaveDays(6)).toBe(3);
    expect(statutoryAnnualLeaveDays(12)).toBe(7);
    expect(statutoryAnnualLeaveDays(24)).toBe(10);
    expect(statutoryAnnualLeaveDays(36)).toBe(14);
    expect(statutoryAnnualLeaveDays(60)).toBe(15);
    expect(statutoryAnnualLeaveDays(120)).toBe(16);
    expect(statutoryAnnualLeaveDays(24 * 12)).toBe(30);
    expect(statutoryAnnualLeaveDays(30 * 12)).toBe(30);
  });
});
