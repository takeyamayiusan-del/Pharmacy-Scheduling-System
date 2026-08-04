import { describe, expect, it } from "vitest";
import {
  calculateRateAmount,
  convertUnitsForFormula,
  deriveHourlyRateFromBase,
  resolveUnitAmount,
} from "@/lib/payroll/rateFormulas";

describe("rateFormulas", () => {
  it("小時公式：時數 × 固定金額", () => {
    expect(
      calculateRateAmount(
        8,
        { amount: 150, formulaType: "fixed_per_hour", percentage: 0 },
        { baseSalary: 30000, hourlyRate: 125 },
        "hour"
      )
    ).toBe(1200);
  });

  it("小時公式：時數 ×（底薪 × %）", () => {
    const unit = resolveUnitAmount(
      { amount: 0, formulaType: "base_salary_percent_per_hour", percentage: 0.4167 },
      { baseSalary: 30000, hourlyRate: 0 }
    );
    expect(unit).toBe(125.01);
    expect(
      calculateRateAmount(
        8,
        { amount: 0, formulaType: "base_salary_percent_per_hour", percentage: 0.4167 },
        { baseSalary: 30000, hourlyRate: 0 },
        "hour"
      )
    ).toBe(1000.08);
  });

  it("小時公式：時數 × 時薪 × 倍數", () => {
    expect(
      calculateRateAmount(
        2,
        { amount: 1.34, formulaType: "hourly_rate_per_hour", percentage: 0 },
        { baseSalary: 30000, hourlyRate: 125 },
        "hour"
      )
    ).toBe(335);
  });

  it("分鐘公式：分鐘 × 固定金額", () => {
    expect(
      calculateRateAmount(
        30,
        { amount: 2, formulaType: "fixed_per_minute", percentage: 0 },
        { baseSalary: 30000, hourlyRate: 125 },
        "minute"
      )
    ).toBe(60);
  });

  it("分鐘公式：分鐘 ×（時薪÷60）× 倍數", () => {
    // 30 × (125/60) × 1 = 62.5
    expect(
      calculateRateAmount(
        30,
        { amount: 1, formulaType: "hourly_rate_per_minute", percentage: 0 },
        { baseSalary: 30000, hourlyRate: 125 },
        "minute"
      )
    ).toBe(62.5);
  });

  it("遲到用分鐘輸入但選小時公式時會自動換算", () => {
    // 30 分鐘 = 0.5 小時 × 150 = 75
    expect(convertUnitsForFormula(30, "minute", "fixed_per_hour")).toBe(0.5);
    expect(
      calculateRateAmount(
        30,
        { amount: 150, formulaType: "fixed_per_hour", percentage: 0 },
        { baseSalary: 30000, hourlyRate: 125 },
        "minute"
      )
    ).toBe(75);
  });

  it("舊版 fixed_amount 仍相容（不換算）", () => {
    expect(
      calculateRateAmount(
        8,
        { amount: 150, formulaType: "fixed_amount", percentage: 0 },
        { baseSalary: 30000, hourlyRate: 125 },
        "hour"
      )
    ).toBe(1200);
  });

  it("由底薪與月工時推算時薪", () => {
    expect(deriveHourlyRateFromBase(30000, 240)).toBe(125);
    expect(deriveHourlyRateFromBase(30000, 0)).toBe(0);
  });
});
