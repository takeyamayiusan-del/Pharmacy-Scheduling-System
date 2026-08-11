import { describe, expect, it } from "vitest";
import {
  buildDeformedHoursSoftWarnings,
  cycleBoundsForDate,
  cyclesOverlappingMonth,
  DEFAULT_WORK_HOURS_CYCLE_ANCHOR,
} from "@/lib/attendance/deformedHoursSoftWarnings";
import { defaultStoreConfigForSite } from "@/lib/store-config";

describe("deformedHoursSoftWarnings", () => {
  it("aligns two-week cycles from anchor Monday", () => {
    const c0 = cycleBoundsForDate("2026-01-05", "two_week", DEFAULT_WORK_HOURS_CYCLE_ANCHOR);
    expect(c0.start).toBe("2026-01-05");
    expect(c0.end).toBe("2026-01-18");
    expect(c0.cycleHoursCap).toBe(80);

    const c1 = cycleBoundsForDate("2026-01-19", "two_week", DEFAULT_WORK_HOURS_CYCLE_ANCHOR);
    expect(c1.start).toBe("2026-01-19");
    expect(c1.end).toBe("2026-02-01");
  });

  it("eight-week cycle is 56 days with 320h cap", () => {
    const c = cycleBoundsForDate("2026-01-10", "eight_week", DEFAULT_WORK_HOURS_CYCLE_ANCHOR);
    expect(c.cycleWeeks).toBe(8);
    expect(c.cycleHoursCap).toBe(320);
    expect(c.start).toBe("2026-01-05");
    expect(c.end).toBe("2026-03-01");
  });

  it("lists cycles overlapping a month", () => {
    const list = cyclesOverlappingMonth(2026, 1, "two_week", DEFAULT_WORK_HOURS_CYCLE_ANCHOR);
    expect(list.length).toBeGreaterThanOrEqual(2);
    // 1/1～1/4 落在上一週期（12/22 起）
    expect(list[0].start).toBe("2025-12-22");
    expect(list.some((c) => c.start === "2026-01-05")).toBe(true);
  });

  it("soft-warns cycle overage without blocking semantics", () => {
    const cfg = defaultStoreConfigForSite("zhushan");
    // 兩周每天排 A(9h) → 14*9=126 > 80
    const warnings = buildDeformedHoursSoftWarnings({
      year: 2026,
      month: 1,
      employees: [{ id: "e1", name: "小明", role: "employee" }],
      storeConfig: cfg,
      getShiftForDate: () => "A",
    });
    expect(warnings.some((w) => w.kind === "cycle" && w.message.includes("小明"))).toBe(true);
    expect(warnings.some((w) => w.kind === "daily")).toBe(false); // A=9 <= 10
    expect(warnings.some((w) => w.kind === "consecutive")).toBe(true);
  });
});
