import { describe, expect, it } from "vitest";
import {
  calcSeveranceNewSystem,
  calcSeveranceOldSystem,
  calcSeverancePay,
  statutoryNoticeDays,
} from "@/lib/offboarding/severance";

describe("statutoryNoticeDays", () => {
  it("returns 0 under 3 months", () => {
    expect(statutoryNoticeDays(2)).toBe(0);
  });
  it("returns 10 for 3-11 months", () => {
    expect(statutoryNoticeDays(6)).toBe(10);
  });
  it("returns 20 for 1-3 years", () => {
    expect(statutoryNoticeDays(24)).toBe(20);
  });
  it("returns 30 for 3+ years", () => {
    expect(statutoryNoticeDays(48)).toBe(30);
  });
});

describe("calcSeveranceNewSystem", () => {
  it("scales by years of service", () => {
    expect(calcSeveranceNewSystem(30000, 24)).toBe(60000);
    expect(calcSeveranceNewSystem(30000, 6)).toBe(15000);
  });
});

describe("calcSeveranceOldSystem", () => {
  it("uses 2 months per year for first 15 years", () => {
    expect(calcSeveranceOldSystem(30000, 24)).toBe(120000);
  });
});

describe("calcSeverancePay", () => {
  it("returns 0 for resignation", () => {
    expect(
      calcSeverancePay({
        pensionSystem: "new",
        averageMonthlyWage: 30000,
        monthsOfService: 24,
        offboardingType: "resignation",
      })
    ).toBe(0);
  });
});
