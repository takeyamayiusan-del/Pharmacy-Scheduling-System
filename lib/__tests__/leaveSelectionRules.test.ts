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

  it("month pool warns on total days, including weekdays", () => {
    const result = checkManagerLeaveAssignment(
      baseEmployee,
      baseEmployee.name,
      "2026-08-03",
      {
        "emp-1": [
          "2026-08-01",
          "2026-08-08",
          "2026-08-15",
          "2026-08-22",
          "2026-08-29",
        ],
      },
      { saturdayLimit: 5, weekdayLimit: 0, monthPool: true }
    );
    expect(result.shouldWarn).toBe(true);
    expect(result.message).toContain("本月排休已達 5/5");
  });

  it("warns half-day rule when assigning full-day rest", () => {
    const result = checkManagerLeaveAssignment(
      { ...baseEmployee, isHalfDayLeaveRule: true },
      baseEmployee.name,
      "2026-08-03",
      { "emp-1": [] },
      { saturdayLimit: 5, weekdayLimit: 0, monthPool: true }
    );
    expect(result.shouldWarn).toBe(true);
    expect(result.message).toContain("只能休半天");
  });
});
