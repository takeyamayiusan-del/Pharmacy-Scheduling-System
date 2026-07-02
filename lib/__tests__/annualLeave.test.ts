import { describe, expect, it } from "vitest";
import { getMonthsOfService, resolveAnnualLeaveQuotaDays } from "@/lib/attendance/annualLeave";
import type { AnnualLeaveConfig, Employee } from "@/lib/context/AppContext";

const employee: Employee = {
  id: "e1",
  name: "測試",
  role: "staff",
  hireDate: "2025-07-01",
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
  });

  it("resolves quota from DB config tiers", () => {
    expect(resolveAnnualLeaveQuotaDays(employee, 2026, configs2026)).toBe(7);
  });
});
