import { describe, expect, it } from "vitest";
import {
  assertNoSundayInSwapDates,
  assertSundayShiftAllowed,
  enforceSundayRestOnChanges,
  isFixedSundayRest,
  isLocalDateInMonth,
  isLocalSaturday,
  getLocalDayOfWeek,
  normalizeCalendarDate,
  parseLocalDateParts,
} from "@/lib/schedule/sundayRest";

describe("sundayRest", () => {
  it("detects Sunday with local calendar (2026-07-19)", () => {
    expect(isFixedSundayRest("2026-07-19")).toBe(true);
    expect(isFixedSundayRest("2026-07-18")).toBe(false);
    expect(isFixedSundayRest("2026-07-20")).toBe(false);
  });

  it("detects Saturday with local calendar", () => {
    expect(isLocalSaturday("2026-07-18")).toBe(true);
    expect(isLocalSaturday("2026-07-19")).toBe(false);
    expect(getLocalDayOfWeek("2026-07-18")).toBe(6);
  });

  it("normalizes ISO timestamps without UTC shifting the calendar day", () => {
    expect(normalizeCalendarDate("2026-08-15")).toBe("2026-08-15");
    expect(normalizeCalendarDate("2026-08-15T00:00:00.000Z")).toBe("2026-08-15");
    expect(normalizeCalendarDate("2026-08-15T16:00:00.000Z")).toBe("2026-08-15");
    expect(parseLocalDateParts("2026-08-15T00:00:00.000Z")).toEqual({ y: 2026, m: 8, d: 15 });
    expect(isLocalDateInMonth("2026-01-01T00:00:00.000Z", 2026, 1)).toBe(true);
    expect(isLocalDateInMonth("2026-01-01T00:00:00.000Z", 2025, 12)).toBe(false);
  });

  it("blocks swap dates that include Sunday", () => {
    expect(assertNoSundayInSwapDates("2026-07-18", "2026-07-19").ok).toBe(false);
    expect(assertNoSundayInSwapDates("2026-07-19", "2026-07-20").ok).toBe(false);
    expect(assertNoSundayInSwapDates("2026-07-18", "2026-07-20").ok).toBe(true);
  });

  it("only allows X on Sunday for schedule edits", () => {
    expect(assertSundayShiftAllowed("2026-07-19", "X").ok).toBe(true);
    expect(assertSundayShiftAllowed("2026-07-19", "A").ok).toBe(false);
    expect(assertSundayShiftAllowed("2026-07-18", "A").ok).toBe(true);
  });

  it("forces Sunday changes back to X", () => {
    expect(
      enforceSundayRestOnChanges([
        { date: "2026-07-19", shift: "A", userId: "u1" },
        { date: "2026-07-18", shift: "B", userId: "u1" },
      ])
    ).toEqual([
      { date: "2026-07-19", shift: "X", userId: "u1" },
      { date: "2026-07-18", shift: "B", userId: "u1" },
    ]);
  });

  it("store setting sundayFixedRest false allows Sunday work and swap", () => {
    expect(assertSundayShiftAllowed("2026-07-19", "A", false).ok).toBe(true);
    expect(assertNoSundayInSwapDates("2026-07-18", "2026-07-19", false).ok).toBe(true);
    expect(
      enforceSundayRestOnChanges(
        [{ date: "2026-07-19", shift: "A", userId: "u1" }],
        false
      )
    ).toEqual([{ date: "2026-07-19", shift: "A", userId: "u1" }]);
  });
});
