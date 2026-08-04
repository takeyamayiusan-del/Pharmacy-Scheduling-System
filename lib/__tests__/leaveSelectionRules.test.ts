import { describe, expect, it } from "vitest";
import { checkManagerLeaveAssignment } from "@/lib/schedule/leaveSelectionRules";
import type { Employee } from "@/lib/context/AppContext";

const baseEmployee: Employee = {
  id: "emp-1",
  name: "測試員工",
  role: "staff",
  hireDate: "2026-01-01",
};

describe("checkManagerLeaveAssignment", () => {
  it("warns when saturday leave exceeds limit", () => {
    const result = checkManagerLeaveAssignment(
      baseEmployee,
      baseEmployee.name,
      "2026-07-11",
      {
        "emp-1": ["2026-07-04", "2026-07-18"],
      }
    );
    expect(result.shouldWarn).toBe(true);
    expect(result.message).toContain("禮拜六排休已達 2/2");
  });

  it("warns for weekday-off rule on weekday", () => {
    const result = checkManagerLeaveAssignment(
      { ...baseEmployee, isWeekdayOffRule: true },
      baseEmployee.name,
      "2026-07-08",
      { "emp-1": [] }
    );
    expect(result.shouldWarn).toBe(true);
    expect(result.message).toContain("平日不排休");
  });

  it("does not warn when date already selected", () => {
    const result = checkManagerLeaveAssignment(
      baseEmployee,
      baseEmployee.name,
      "2026-07-08",
      { "emp-1": ["2026-07-08"] }
    );
    expect(result.shouldWarn).toBe(false);
  });
});
