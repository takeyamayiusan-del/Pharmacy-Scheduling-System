import { describe, expect, it } from "vitest";
import {
  calculateRateAmount,
  deriveHourlyRateFromBase,
  resolveUnitAmount,
} from "@/lib/payroll/rateFormulas";

describe("rateFormulas", () => {
  it("固定金額：時數 × 金額", () => {
    expect(
      calculateRateAmount(
        8,
        { amount: 150, formulaType: "fixed_amount", percentage: 0 },
        { baseSalary: 30000, hourlyRate: 125 }
      )
    ).toBe(1200);
  });

  it("底薪百分比：時數 ×（底薪 × %）", () => {
    // 30000 × 0.4167% = 125.01 → 125.01 × 8
    const unit = resolveUnitAmount(
      { amount: 0, formulaType: "base_salary_percent", percentage: 0.4167 },
      { baseSalary: 30000, hourlyRate: 0 }
    );
    expect(unit).toBe(125.01);
    expect(
      calculateRateAmount(
        8,
        { amount: 0, formulaType: "base_salary_percent", percentage: 0.4167 },
        { baseSalary: 30000, hourlyRate: 0 }
      )
    ).toBe(1000.08);
  });

  it("員工時薪倍數：時數 × 時薪 × 倍數", () => {
    expect(
      calculateRateAmount(
        2,
        { amount: 1.34, formulaType: "hourly_rate", percentage: 0 },
        { baseSalary: 30000, hourlyRate: 125 }
      )
    ).toBe(335);
  });

  it("由底薪與月工時推算時薪", () => {
    expect(deriveHourlyRateFromBase(30000, 240)).toBe(125);
    expect(deriveHourlyRateFromBase(30000, 0)).toBe(0);
  });
});
