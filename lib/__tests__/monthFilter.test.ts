import { describe, expect, it } from "vitest";
import {
  doesRangeOverlapYearMonth,
  getMonthBounds,
  isDateInYearMonth,
} from "@/components/MonthFilterBar";

describe("month filter helpers", () => {
  it("getMonthBounds", () => {
    expect(getMonthBounds(2026, 8)).toEqual({
      monthStart: "2026-08-01",
      monthEnd: "2026-08-31",
    });
  });

  it("isDateInYearMonth", () => {
    expect(isDateInYearMonth("2026-08-03", 2026, 8)).toBe(true);
    expect(isDateInYearMonth("2026-07-31", 2026, 8)).toBe(false);
    expect(isDateInYearMonth("2026-08-03T00:00:00", 2026, 8)).toBe(true);
  });

  it("doesRangeOverlapYearMonth", () => {
    expect(doesRangeOverlapYearMonth("2026-07-28", "2026-08-02", 2026, 8)).toBe(true);
    expect(doesRangeOverlapYearMonth("2026-07-01", "2026-07-31", 2026, 8)).toBe(false);
    expect(doesRangeOverlapYearMonth("2026-08-10", "2026-08-12", 2026, 8)).toBe(true);
  });
});
