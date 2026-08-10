import { describe, expect, it } from "vitest";
import {
  assertWritableShiftCode,
  getScheduleShiftOptions,
  resolveShiftDisplay,
  resolveShiftTimeRanges,
} from "@/lib/shift-catalog/resolve";
import { defaultStoreConfigForSite } from "@/lib/store-config";
import { getHeadStoreShiftTemplate } from "@/lib/shift-catalog";

const legacyTime = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-17:00"],
  C: ["08:30-12:00"],
  D: ["13:30-17:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

const legacyDisplay = {
  A: { label: "全天", displayText: "A", bgColor: "#a", textColor: "#b", borderColor: "#c" },
  B: { label: "白班", displayText: "B", bgColor: "#a", textColor: "#b", borderColor: "#c" },
  C: { label: "上午", displayText: "C", bgColor: "#a", textColor: "#b", borderColor: "#c" },
  D: { label: "下午", displayText: "D", bgColor: "#a", textColor: "#b", borderColor: "#c" },
  E: { label: "下午+晚", displayText: "E", bgColor: "#a", textColor: "#b", borderColor: "#c" },
  X: { label: "休假", displayText: "X", bgColor: "#a", textColor: "#b", borderColor: "#c" },
};

describe("shift-catalog/resolve", () => {
  it("zhushan uses legacy A–E options and times", () => {
    const cfg = defaultStoreConfigForSite("zhushan");
    expect(getScheduleShiftOptions(cfg)).toContain("B");
    expect(resolveShiftTimeRanges("B", cfg, legacyTime)).toEqual(legacyTime.B);
    expect(assertWritableShiftCode("白班1", cfg).ok).toBe(false);
    expect(assertWritableShiftCode("B", cfg).ok).toBe(true);
  });

  it("jiji resolves catalog times and display", () => {
    const cfg = defaultStoreConfigForSite("jiji");
    cfg.shiftCatalog = getHeadStoreShiftTemplate();
    const code = cfg.shiftCatalog[0].code;
    expect(getScheduleShiftOptions(cfg)).toContain(code);
    expect(resolveShiftTimeRanges(code, cfg, legacyTime)[0]).toMatch(/^\d{2}:\d{2}-/);
    const style = resolveShiftDisplay(code, cfg, legacyDisplay);
    expect(style.label).toBe(cfg.shiftCatalog[0].name);
    expect(style.displayText).toBe(code);
    expect(assertWritableShiftCode(code, cfg).ok).toBe(true);
    expect(assertWritableShiftCode("B", cfg).ok).toBe(true);
    expect(assertWritableShiftCode("不存在的班", cfg).ok).toBe(false);
  });
});
