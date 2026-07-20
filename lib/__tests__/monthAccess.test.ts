import { describe, expect, it, vi, afterEach } from "vitest";
import {
  currentMonthMinDate,
  hasPastMonthInRange,
  isPastDate,
  isPastMonth,
} from "@/lib/schedule/monthAccess";

describe("monthAccess", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isPastMonth returns true for months before current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // 2026-06-15

    expect(isPastMonth(2026, 5)).toBe(true);
    expect(isPastMonth(2026, 6)).toBe(false);
    expect(isPastMonth(2026, 7)).toBe(false);
  });

  it("isPastDate treats any day in a past month as past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 30)); // 2026-06-30

    expect(isPastDate("2026-05-31")).toBe(true);
    expect(isPastDate("2026-06-01")).toBe(false);
  });

  it("currentMonthMinDate returns first day of current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20)); // 2026-03-20

    expect(currentMonthMinDate()).toBe("2026-03-01");
  });

  it("hasPastMonthInRange detects past months in a date range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 1)); // 2026-06-01

    expect(hasPastMonthInRange("2026-05-10", "2026-06-05")).toBe(true);
    expect(hasPastMonthInRange("2026-06-01", "2026-06-30")).toBe(false);
    expect(hasPastMonthInRange("2026-07-01", "2026-07-15")).toBe(false);
  });
});
