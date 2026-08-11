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
    // 兩周每天排 A(9h) → 14*9=126 > 80；1 月完整週期僅 01-05～01-18
    const warnings = buildDeformedHoursSoftWarnings({
      year: 2026,
      month: 1,
      employees: [{ id: "e1", name: "小明", role: "employee" }],
      storeConfig: cfg,
      getShiftForDate: () => "A",
    });
    expect(warnings.some((w) => w.kind === "cycle" && w.message.includes("小明"))).toBe(true);
    expect(warnings.some((w) => w.message.includes("2026-01-05") && w.message.includes("2026-01-18"))).toBe(
      true
    );
    // 跨月週期不在本月提醒
    expect(warnings.some((w) => w.message.includes("2025-12-22"))).toBe(false);
    expect(warnings.some((w) => w.message.includes("2026-02-01"))).toBe(false);
    expect(warnings.some((w) => w.kind === "daily")).toBe(false); // A=9 <= 10
    expect(warnings.some((w) => w.kind === "consecutive")).toBe(true);
  });

  it("skips cross-month cycles when viewing August", () => {
    const cfg = defaultStoreConfigForSite("zhushan");
    const warnings = buildDeformedHoursSoftWarnings({
      year: 2026,
      month: 8,
      employees: [{ id: "e1", name: "小明", role: "employee" }],
      storeConfig: cfg,
      getShiftForDate: () => "A",
    });
    const cycleMsgs = warnings.filter((w) => w.kind === "cycle").map((w) => w.message);
    expect(cycleMsgs.some((m) => m.includes("2026-07-20"))).toBe(false);
    expect(cycleMsgs.some((m) => m.includes("2026-08-31"))).toBe(false);
    expect(cycleMsgs.some((m) => m.includes("2026-08-03") && m.includes("2026-08-16"))).toBe(true);
    expect(cycleMsgs.some((m) => m.includes("2026-08-17") && m.includes("2026-08-30"))).toBe(true);
  });
});
