import { describe, expect, it } from "vitest";
import {
  calculateFullAttendancePay,
  contractualPay,
  hoursToLeaveDays,
  wageBaseForOvertime,
  type EmployeeSalaryItem,
} from "./salaryItems";

describe("hoursToLeaveDays", () => {
  it("converts 8 hours to 1 day", () => {
    expect(hoursToLeaveDays(8)).toBe(1);
  });
  it("converts 4 hours to 0.5 day", () => {
    expect(hoursToLeaveDays(4)).toBe(0.5);
  });
});

describe("calculateFullAttendancePay", () => {
  it("pays full amount with no leave", () => {
    const r = calculateFullAttendancePay({
      configuredAmount: 3000,
      leaveHoursByType: {},
    });
    expect(r.paidAmount).toBe(3000);
    expect(r.sickDeduction).toBe(0);
  });

  it("deducts 1/30 per ordinary sick day, not zero", () => {
    const r = calculateFullAttendancePay({
      configuredAmount: 3000,
      leaveHoursByType: { 病假: 8 },
    });
    expect(r.sickDays).toBe(1);
    expect(r.sickDeduction).toBe(100); // 3000/30
    expect(r.paidAmount).toBe(2900);
  });

  it("does not deduct for bereavement / annual / other", () => {
    const r = calculateFullAttendancePay({
      configuredAmount: 3000,
      leaveHoursByType: { 喪假: 16, 特休: 8, 其他: 8 },
    });
    expect(r.paidAmount).toBe(3000);
    expect(r.protectedLeaveHours).toBe(32);
  });

  it("deducts personal leave at 1/30 per day with note", () => {
    const r = calculateFullAttendancePay({
      configuredAmount: 3000,
      leaveHoursByType: { 事假: 8 },
    });
    expect(r.personalLeaveDeduction).toBe(100);
    expect(r.paidAmount).toBe(2900);
    expect(r.notes.some((n) => n.includes("照顧家人"))).toBe(true);
  });

  it("flags yearly sick leave under 10 days", () => {
    const r = calculateFullAttendancePay({
      configuredAmount: 3000,
      leaveHoursByType: {},
      yearlySickLeaveDays: 3,
    });
    expect(r.yearlySickUnderTenDays).toBe(true);
    expect(r.notes.some((n) => n.includes("未滿 10 日"))).toBe(true);
  });
});

describe("contractual and wage base", () => {
  const items: EmployeeSalaryItem[] = [
    {
      id: "1",
      userId: "u",
      category: "position_grade",
      label: "藥師加級",
      amount: 5000,
      presetKey: null,
      countsAsWage: true,
      isEnabled: true,
      sortOrder: 0,
    },
    {
      id: "2",
      userId: "u",
      category: "fixed_allowance",
      label: "全勤獎金",
      amount: 3000,
      presetKey: "full_attendance",
      countsAsWage: true,
      isEnabled: true,
      sortOrder: 1,
    },
  ];

  it("sums base + position grades for contractual pay", () => {
    expect(contractualPay(28000, items)).toBe(33000);
  });

  it("includes wage-flagged items in OT base", () => {
    expect(wageBaseForOvertime(28000, items)).toBe(36000);
  });
});
