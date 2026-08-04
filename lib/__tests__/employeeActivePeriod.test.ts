import { describe, expect, it } from "vitest";
import {
  isEmployeeActiveOnDate,
  isEmployeeActiveInMonth,
} from "@/lib/schedule/employeeActivePeriod";

describe("isEmployeeActiveOnDate", () => {
  it("hides before hire date", () => {
    expect(
      isEmployeeActiveOnDate({ hireDate: "2026-08-10", endDate: null }, "2026-08-09")
    ).toBe(false);
    expect(
      isEmployeeActiveOnDate({ hireDate: "2026-08-10", endDate: null }, "2026-08-10")
    ).toBe(true);
  });

  it("hides after end date (到期日當天仍算在職)", () => {
    expect(
      isEmployeeActiveOnDate({ hireDate: "2026-01-01", endDate: "2026-08-15" }, "2026-08-15")
    ).toBe(true);
    expect(
      isEmployeeActiveOnDate({ hireDate: "2026-01-01", endDate: "2026-08-15" }, "2026-08-16")
    ).toBe(false);
  });

  it("supports ISO datetime strings from database", () => {
    expect(
      isEmployeeActiveOnDate(
        { hireDate: "2026-08-03T00:00:00+08:00", endDate: null },
        "2026-08-02"
      )
    ).toBe(false);
    expect(
      isEmployeeActiveOnDate(
        { hireDate: "2026-08-03T00:00:00+08:00", endDate: null },
        "2026-08-03"
      )
    ).toBe(true);
  });
});

describe("isEmployeeActiveInMonth", () => {
  it("hides whole month when not yet hired", () => {
    expect(
      isEmployeeActiveInMonth({ hireDate: "2026-09-01", endDate: null }, 2026, 8)
    ).toBe(false);
  });

  it("hides whole month when hire is after month end", () => {
    expect(
      isEmployeeActiveInMonth({ hireDate: "2026-09-15", endDate: null }, 2026, 8)
    ).toBe(false);
  });

  it("hides whole month when already ended", () => {
    expect(
      isEmployeeActiveInMonth({ hireDate: "2025-01-01", endDate: "2026-07-31" }, 2026, 8)
    ).toBe(false);
  });

  it("shows hire month even if hired mid-month (pre-hire days are X elsewhere)", () => {
    expect(
      isEmployeeActiveInMonth({ hireDate: "2026-08-20", endDate: null }, 2026, 8)
    ).toBe(true);
  });

  it("shows month that overlaps employment", () => {
    expect(
      isEmployeeActiveInMonth({ hireDate: "2026-08-20", endDate: "2026-09-10" }, 2026, 8)
    ).toBe(true);
  });

  it("hides month before hire when hireDate contains time", () => {
    expect(
      isEmployeeActiveInMonth(
        { hireDate: "2026-08-03T00:00:00+08:00", endDate: null },
        2026,
        7
      )
    ).toBe(false);
  });
});
