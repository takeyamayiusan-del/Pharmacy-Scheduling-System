import { describe, expect, it } from "vitest";
import {
  buildDeformedHoursSoftWarnings,
  cycleBoundsForDate,
  cyclesOverlappingMonth,
  defaultSoftLimitsForRegime,
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

  it("eight-week cycle is 56 days with 320h cap and 8h daily", () => {
    const c = cycleBoundsForDate("2026-01-10", "eight_week", DEFAULT_WORK_HOURS_CYCLE_ANCHOR);
    expect(c.cycleWeeks).toBe(8);
    expect(c.cycleHoursCap).toBe(320);
    expect(defaultSoftLimitsForRegime("eight_week").dailyHoursCap).toBe(8);
    expect(defaultSoftLimitsForRegime("two_week").dailyHoursCap).toBe(10);
  });

  it("lists cycles overlapping a month", () => {
    const list = cyclesOverlappingMonth(2026, 1, "two_week", DEFAULT_WORK_HOURS_CYCLE_ANCHOR);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].start).toBe("2025-12-22");
    expect(list.some((c) => c.start === "2026-01-05")).toBe(true);
  });

  it("soft-warns cycle overage and skips cross-month cycles", () => {
    const cfg = defaultStoreConfigForSite("zhushan");
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
    expect(warnings.some((w) => w.message.includes("2025-12-22"))).toBe(false);
    // A≈9h ≤ 兩周單日10h
    expect(warnings.some((w) => w.kind === "daily")).toBe(false);
    expect(warnings.some((w) => w.kind === "regular_leave")).toBe(true);
  });

  it("warns daily overage under eight-week (max 8h)", () => {
    const cfg = {
      ...defaultStoreConfigForSite("jiji"),
      workHoursRegime: "eight_week" as const,
    };
    const warnings = buildDeformedHoursSoftWarnings({
      year: 2026,
      month: 1,
      employees: [{ id: "e1", name: "小華", role: "employee" }],
      storeConfig: cfg,
      // 竹山 A≈9h > 八周單日 8h
      getShiftForDate: (date) => (date.endsWith("-04") ? "A" : "X"),
    });
    expect(warnings.some((w) => w.kind === "daily" && w.message.includes("小華"))).toBe(true);
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
  });

  it("uses hire date as cycle anchor when store policy is on", () => {
    const cfg = defaultStoreConfigForSite("jiji");
    const fromHire = cyclesOverlappingMonth(2026, 8, "eight_week", "2026-03-12");
    const fromStore = cyclesOverlappingMonth(2026, 8, "eight_week", cfg.workHoursCycleAnchor);
    expect(fromHire[0].start).not.toBe(fromStore[0].start);
    const warnings = buildDeformedHoursSoftWarnings({
      year: 2026,
      month: 8,
      employees: [
        { id: "e1", name: "店長", role: "manager", hireDate: "2026-03-12" },
      ],
      storeConfig: cfg,
      getShiftForDate: () => "X",
    });
    expect(warnings.some((w) => w.kind === "cycle")).toBe(false);
    expect(fromHire.some((c) => c.start === "2026-03-12" || c.start.startsWith("2026-"))).toBe(
      true
    );
  });
});
