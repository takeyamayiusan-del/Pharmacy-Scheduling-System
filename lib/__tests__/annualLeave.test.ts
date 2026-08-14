import { describe, expect, it } from "vitest";
import {
  getAsOfDateForYear,
  getMonthsOfService,
  resolveAnnualLeaveQuotaDays,
} from "@/lib/attendance/annualLeave";
import type { AnnualLeaveConfig, Employee } from "@/lib/context/AppContext";

const employee: Employee = {
  id: "e1",
  name: "測試",
  role: "staff",
  hireDate: "2025-07-01",
};

const newHireApril2026: Employee = {
  id: "e2",
  name: "新進員工",
  role: "staff",
  hireDate: "2026-04-01",
};

const configs2026: AnnualLeaveConfig[] = [
  { id: "1", year: 2026, seniorityMonths: 0, days: 0, createdAt: "", updatedAt: "" },
  { id: "2", year: 2026, seniorityMonths: 6, days: 3, createdAt: "", updatedAt: "" },
  { id: "3", year: 2026, seniorityMonths: 12, days: 7, createdAt: "", updatedAt: "" },
];

describe("annualLeave", () => {
  it("computes months of service", () => {
    expect(getMonthsOfService("2025-07-01", new Date(2026, 0, 1))).toBe(6);
    expect(getMonthsOfService("2025-07-01", new Date(2026, 11, 31))).toBe(17);
    expect(getMonthsOfService("2026-04-01", new Date(2026, 6, 5))).toBe(3);
  });

  it("uses today for current year, year-end for other years", () => {
    const july2026 = new Date(2026, 6, 5);
    expect(getAsOfDateForYear(2026, july2026).getMonth()).toBe(6);
    expect(getAsOfDateForYear(2025, july2026).getMonth()).toBe(11);
    expect(getAsOfDateForYear(2027, july2026).getMonth()).toBe(11);
  });

  it("resolves quota from DB config tiers", () => {
    const dec2026 = new Date(2026, 11, 31);
    expect(resolveAnnualLeaveQuotaDays(employee, 2026, configs2026, dec2026)).toBe(7);
  });

  it("gives 0 days to new hires under 6 months in current year", () => {
    const july2026 = new Date(2026, 6, 5);
    expect(resolveAnnualLeaveQuotaDays(newHireApril2026, 2026, configs2026, july2026)).toBe(0);
    expect(resolveAnnualLeaveQuotaDays(newHireApril2026, 2026, [], july2026)).toBe(0);
  });

  it("gives 3 days after 6 months in current year", () => {
    const oct2026 = new Date(2026, 9, 1);
    expect(resolveAnnualLeaveQuotaDays(newHireApril2026, 2026, configs2026, oct2026)).toBe(3);
  });

  it("projects year-end quota when viewing a different calendar year", () => {
    const july2026 = new Date(2026, 6, 5);
    // 2027 年度總表以 12/31 估算：入職約 20 個月 → 滿一年 7 天
    expect(resolveAnnualLeaveQuotaDays(newHireApril2026, 2027, configs2026, july2026)).toBe(7);
  });

  it("uses Labor Standards Act ladder when no config rows exist", () => {
    const twoYears = {
      ...employee,
      hireDate: "2024-01-01",
    };
    expect(resolveAnnualLeaveQuotaDays(twoYears, 2026, [], new Date(2026, 6, 1))).toBe(10);
  });
});
