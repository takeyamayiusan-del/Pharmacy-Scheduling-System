import { describe, expect, it } from "vitest";
import {
  buildJijiStoreConfigWithTemplate,
  defaultStoreConfig,
  defaultStoreConfigForSite,
  getActiveRuleTags,
  getEnabledShiftCodes,
  getMonthRotationDates,
  getRotationShiftOptions,
  isRotationEveningDay,
  parseStoreConfig,
  resolveRotationOffLimit,
  shouldSeedJijiShiftCatalog,
  suggestRotationMenuLabel,
} from "@/lib/store-config";
import { getHeadStoreShiftTemplate } from "@/lib/shift-catalog";

describe("store-config", () => {
  it("default matches YaoSheng Wednesday rotation", () => {
    const c = defaultStoreConfig();
    expect(c.features.rotationEvening).toBe(true);
    expect(c.features.customShiftCatalog).toBe(false);
    expect(c.rotationEvening.weekdays).toEqual([3]);
    expect(c.rotationEvening.menuLabel).toBe("禮三晚班");
    expect(c.defaultWeekdayShift).toBe("B");
    expect(c.defaultSaturdayShift).toBe("C");
    // 備援鏡像存在，但不啟用目錄
    expect(c.shiftCatalog.map((s) => s.code)).toEqual(["A", "B", "C", "D", "E", "X"]);
  });

  it("jiji defaults enable catalog and disable zhushan rotation rules", () => {
    const c = defaultStoreConfigForSite("jiji");
    expect(c.storeName).toBe("家禾藥局");
    expect(c.siteId).toBe("jiji");
    expect(c.features.customShiftCatalog).toBe(true);
    expect(c.features.rotationEvening).toBe(false);
    expect(c.features.weekdayOffRule).toBe(false);
    expect(c.features.halfDayLeaveRule).toBe(true);
    expect(getActiveRuleTags(c).map((t) => t.id)).toContain("half_day_leave");
    expect(c.workHoursRegime).toBe("eight_week");
    expect(c.policies.overtimeMinApplyMinutes).toBe(30);
    expect(c.policies.overtimeForceCompLeaveAfterMinutes).toBe(60);
    expect(c.policies.overtimeMealDeductAfterMinutes).toBe(240);
    expect(c.policies.saturdayQuotaMode).toBe("month_pool");
    expect(c.policies.approvalChain).toEqual(["manager", "deputy", "owner"]);
    expect(c.policies.approvalMode).toBe("sequential");
    expect(defaultStoreConfigForSite("zhushan").policies.approvalMode).toBe("any");
    expect(c.policies.autoRestSuggestEnabled).toBe(true);
    expect(defaultStoreConfigForSite("zhushan").workHoursRegime).toBe("two_week");
    expect(defaultStoreConfigForSite("zhushan").policies.overtimeForceCompLeaveAfterMinutes).toBe(60);
  });

  it("buildJijiStoreConfigWithTemplate loads head-store catalog and defaults", () => {
    const c = buildJijiStoreConfigWithTemplate();
    expect(c.features.customShiftCatalog).toBe(true);
    expect(c.shiftCatalog.length).toBeGreaterThan(10);
    expect(c.shiftCatalog.some((s) => s.code === "白班1")).toBe(true);
    expect(c.defaultWeekdayShift).toBe("白班5");
    expect(c.defaultSaturdayShift).toBe("白班2");
    expect(c.rotationEvening.onDutyShift).toBe("晚班1");
    expect(c.rotationEvening.offDutyShift).toBe("白班5");
    expect(c.features.rotationEvening).toBe(false);
    expect(getRotationShiftOptions(c)).toContain("晚班1");
    expect(getRotationShiftOptions(c)).not.toContain("X");
    expect(shouldSeedJijiShiftCatalog(c)).toBe(false);
    expect(shouldSeedJijiShiftCatalog(defaultStoreConfigForSite("jiji"))).toBe(true);
  });

  it("parseStoreConfig keeps jiji rotation catalog codes", () => {
    const template = getHeadStoreShiftTemplate();
    const c = parseStoreConfig(
      {
        features: { customShiftCatalog: true, rotationEvening: true },
        shiftCatalog: template,
        rotationEvening: {
          weekdays: [4],
          onDutyShift: "晚班1",
          offDutyShift: "白班5",
        },
      },
      "jiji"
    );
    expect(c.rotationEvening.onDutyShift).toBe("晚班1");
    expect(c.rotationEvening.offDutyShift).toBe("白班5");
  });

  it("parseStoreConfig falls back invalid rotation codes for zhushan", () => {
    const c = parseStoreConfig({
      features: { customShiftCatalog: false },
      rotationEvening: {
        onDutyShift: "晚班1",
        offDutyShift: "白班5",
      },
    });
    expect(c.rotationEvening.onDutyShift).toBe("A");
    expect(c.rotationEvening.offDutyShift).toBe("B");
    expect(getRotationShiftOptions(c)).toEqual(
      expect.arrayContaining(["A", "B", "C", "D", "E"])
    );
    expect(getRotationShiftOptions(c)).not.toContain("X");
  });

  it("parseStoreConfig fills missing fields", () => {
    const c = parseStoreConfig({
      storeName: "分店A",
      features: { rotationEvening: false },
      rotationEvening: { weekdays: [4, 5], menuLabel: "週四晚班" },
    });
    expect(c.storeName).toBe("分店A");
    expect(c.features.rotationEvening).toBe(false);
    expect(c.features.weekdayOffRule).toBe(true);
    expect(c.features.customShiftCatalog).toBe(false);
    expect(c.rotationEvening.weekdays).toEqual([4, 5]);
    expect(c.rotationEvening.menuLabel).toBe("週四晚班");
    expect(c.shifts).toHaveLength(6);
  });

  it("parseStoreConfig keeps jiji catalog when provided", () => {
    const template = getHeadStoreShiftTemplate().slice(0, 2);
    const c = parseStoreConfig(
      {
        storeName: "家禾藥局",
        features: { customShiftCatalog: true },
        shiftCatalog: template,
        defaultWeekdayShift: template[0].code,
        defaultSaturdayShift: template[1].code,
      },
      "jiji"
    );
    expect(c.features.customShiftCatalog).toBe(true);
    expect(c.shiftCatalog).toHaveLength(2);
    expect(c.shiftCatalog[0].name).toBeTruthy();
    expect(c.defaultWeekdayShift).toBe(template[0].code);
    expect(c.defaultSaturdayShift).toBe(template[1].code);
  });

  it("parseStoreConfig rejects unknown catalog default for zhushan", () => {
    const c = parseStoreConfig({
      defaultWeekdayShift: "白班1",
      features: { customShiftCatalog: false },
    });
    expect(c.defaultWeekdayShift).toBe("B");
  });

  it("isRotationEveningDay respects feature flag and weekdays", () => {
    const c = parseStoreConfig({
      features: { rotationEvening: true },
      rotationEvening: { weekdays: [4] },
    });
    // 2026-08-06 is Thursday
    expect(isRotationEveningDay("2026-08-06", c)).toBe(true);
    expect(isRotationEveningDay("2026-08-05", c)).toBe(false);

    c.features.rotationEvening = false;
    expect(isRotationEveningDay("2026-08-06", c)).toBe(false);
  });

  it("resolveRotationOffLimit uses auto half or fixed", () => {
    const auto = parseStoreConfig({
      rotationEvening: { weekdays: [3], monthlyOffLimit: null },
    });
    // Aug 2026 has 4 Wednesdays → ceil(4/2)=2
    expect(getMonthRotationDates(2026, 8, [3]).length).toBe(4);
    expect(resolveRotationOffLimit(2026, 8, auto)).toBe(2);

    const fixed = parseStoreConfig({
      rotationEvening: { weekdays: [3], monthlyOffLimit: 1 },
    });
    expect(resolveRotationOffLimit(2026, 8, fixed)).toBe(1);
  });

  it("getEnabledShiftCodes and active rule tags", () => {
    const c = parseStoreConfig({
      shifts: [
        { code: "A", name: "全天", enabled: true },
        { code: "B", name: "白班", enabled: false },
        { code: "C", name: "上午", enabled: true },
        { code: "D", name: "下午", enabled: false },
        { code: "E", name: "下午+晚", enabled: false },
        { code: "X", name: "休假", enabled: true },
      ],
      features: { rotationEvening: true, weekdayOffRule: false },
    });
    expect(getEnabledShiftCodes(c)).toEqual(["A", "C", "X"]);
    expect(getActiveRuleTags(c).map((t) => t.id)).toEqual(["rotation_evening"]);
  });

  it("suggestRotationMenuLabel", () => {
    expect(suggestRotationMenuLabel([3])).toBe("禮三晚班");
    expect(suggestRotationMenuLabel([4])).toBe("週四晚班");
    expect(suggestRotationMenuLabel([3, 4])).toBe("週期輪班");
  });
});
