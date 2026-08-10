import { describe, expect, it } from "vitest";
import { buildZhushanLegacyCatalog } from "@/lib/shift-catalog/zhushan-legacy";
import {
  getAttendeeShiftOptions,
} from "@/lib/attendance/flexibleAttendance";
import { getHolidayWorkShiftOptions } from "@/lib/schedule/holidayOneClick";
import { getScheduleShiftOptions } from "@/lib/shift-catalog/resolve";
import { getShiftWorkHours } from "@/lib/attendance/canonicalMonthHours";
import {
  defaultStoreConfig,
  defaultStoreConfigForSite,
  parseStoreConfig,
} from "@/lib/store-config";

const legacyTimes = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

describe("zhushan unified codepath keeps legacy behavior", () => {
  it("defaults keep catalog feature off and A–E options", () => {
    const c = defaultStoreConfig();
    expect(c.features.customShiftCatalog).toBe(false);
    expect(c.features.rotationEvening).toBe(true);
    expect(c.rotationEvening.onDutyShift).toBe("A");
    expect(getScheduleShiftOptions(c)).toEqual(["A", "B", "C", "D", "E", "X"]);
    expect(getHolidayWorkShiftOptions(c).map((o) => o.value)).toEqual([
      "auto",
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
    expect(getAttendeeShiftOptions(c)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("carries dormant A–E catalog mirror without enabling feature", () => {
    const c = defaultStoreConfigForSite("zhushan");
    expect(c.features.customShiftCatalog).toBe(false);
    expect(c.shiftCatalog.map((s) => s.code)).toEqual(["A", "B", "C", "D", "E", "X"]);
    expect(buildZhushanLegacyCatalog().find((s) => s.code === "B")?.nominalHours).toBe(8);
  });

  it("parseStoreConfig fills dormant catalog for empty zhushan rows", () => {
    const c = parseStoreConfig(
      { storeName: "耀聖藥局", features: { customShiftCatalog: false } },
      "zhushan"
    );
    expect(c.features.customShiftCatalog).toBe(false);
    expect(c.shiftCatalog.some((s) => s.code === "A")).toBe(true);
    expect(getShiftWorkHours("B", legacyTimes, c)).toBe(8);
    expect(getShiftWorkHours("A", legacyTimes, c)).toBe(9);
  });

  it("jiji still uses catalog feature", () => {
    const c = defaultStoreConfigForSite("jiji");
    expect(c.features.customShiftCatalog).toBe(true);
    expect(c.features.rotationEvening).toBe(false);
  });
});
