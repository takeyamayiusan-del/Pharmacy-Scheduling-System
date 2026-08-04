import { describe, expect, it } from "vitest";
import {
  assertNoSundayInSwapDates,
  assertSundayShiftAllowed,
  enforceSundayRestOnChanges,
  isFixedSundayRest,
} from "@/lib/schedule/sundayRest";

describe("sundayRest", () => {
  it("detects Sunday with local calendar (2026-07-19)", () => {
    expect(isFixedSundayRest("2026-07-19")).toBe(true);
    expect(isFixedSundayRest("2026-07-18")).toBe(false);
    expect(isFixedSundayRest("2026-07-20")).toBe(false);
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
});
