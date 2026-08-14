import { describe, expect, it } from "vitest";
import { calculateLeavePayDeduction } from "@/lib/payroll/leaveDeduction";

const salary = { baseSalary: 36000, hourlyRate: 0 };

describe("calculateLeavePayDeduction", () => {
  it("有薪假不扣（即使費率誤填）", () => {
    const r = calculateLeavePayDeduction({
      leaveType: "特休",
      hours: 8,
      salary,
      rate: { itemKey: "leave_annual", amount: 150, formulaType: "fixed_per_hour", percentage: 0 },
    });
    expect(r.amount).toBe(0);
    expect(r.payKind).toBe("paid");
  });

  it("公假有薪不扣", () => {
    const r = calculateLeavePayDeduction({
      leaveType: "公假",
      hours: 8,
      salary,
      rate: null,
    });
    expect(r.amount).toBe(0);
  });

  it("無薪事假沒填費率時用月薪÷30÷8", () => {
    const r = calculateLeavePayDeduction({
      leaveType: "事假",
      hours: 8,
      salary,
      rate: { itemKey: "leave_personal", amount: 0, formulaType: "fixed_per_hour", percentage: 0 },
    });
    // 36000/30/8 = 150；8小時 = 1200
    expect(r.amount).toBe(1200);
    expect(r.usedFallback).toBe(true);
    expect(r.payKind).toBe("unpaid");
  });

  it("半薪病假沒填費率時扣一半時薪", () => {
    const r = calculateLeavePayDeduction({
      leaveType: "病假",
      hours: 8,
      salary,
      rate: null,
    });
    expect(r.amount).toBe(600);
    expect(r.payKind).toBe("half");
  });

  it("有填費率時以費率為準（半薪不重乘 0.5）", () => {
    const r = calculateLeavePayDeduction({
      leaveType: "病假",
      hours: 8,
      salary,
      rate: { itemKey: "leave_sick", amount: 80, formulaType: "fixed_per_hour", percentage: 0 },
    });
    expect(r.amount).toBe(640);
    expect(r.usedFallback).toBe(false);
  });

  it("店規把婚假改無薪時會扣", () => {
    const r = calculateLeavePayDeduction({
      leaveType: "婚假",
      hours: 8,
      salary,
      rate: null,
      overrides: { 婚假: { daysLimit: 8, payKind: "unpaid" } },
    });
    expect(r.amount).toBe(1200);
    expect(r.payKind).toBe("unpaid");
  });
});
