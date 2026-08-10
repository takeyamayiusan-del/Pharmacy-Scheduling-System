import { describe, expect, it } from "vitest";
import {
  createEmptyCatalogShift,
  deriveShortLabel,
  formatCatalogShiftSummary,
  getHeadStoreShiftTemplate,
  parseCatalogShifts,
} from "@/lib/shift-catalog";

describe("shift-catalog", () => {
  it("loads head-store template with work segments and short labels", () => {
    const list = getHeadStoreShiftTemplate();
    expect(list.length).toBeGreaterThan(10);
    expect(list.every((s) => s.name && s.workSegments.length > 0)).toBe(true);
    const bai2 = list.find((s) => s.code === "白班2");
    expect(bai2?.shortLabel).toBe("白2");
    const wan1 = list.find((s) => s.code === "晚班1");
    expect(wan1?.shortLabel).toBe("晚1");
  });

  it("parses split shifts with multiple segments", () => {
    const list = parseCatalogShifts([
      {
        name: "兩頭班",
        category: "split",
        workSegments: [
          { start: "08:00", end: "12:00" },
          { start: "17:00", end: "21:00" },
        ],
        breaks: [],
        nominalHours: 8,
      },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].workSegments).toHaveLength(2);
    expect(formatCatalogShiftSummary(list[0])).toContain("08:00-12:00");
  });

  it("createEmptyCatalogShift has defaults", () => {
    const s = createEmptyCatalogShift({ name: "測試班" });
    expect(s.name).toBe("測試班");
    expect(s.enabled).toBe(true);
    expect(s.workSegments[0].start).toBe("09:00");
    expect(s.shortLabel).toBeTruthy();
  });

  it("deriveShortLabel shortens common catalog codes", () => {
    expect(deriveShortLabel("白班2", "day")).toBe("白2");
    expect(deriveShortLabel("晚班1", "night")).toBe("晚1");
    expect(deriveShortLabel("兩頭班兩段班1", "split")).toBe("兩1");
    expect(deriveShortLabel("X", "off")).toBe("休");
  });

  it("keeps explicit shortLabel when provided", () => {
    const list = parseCatalogShifts([
      {
        name: "白班特別",
        code: "白班特別長碼",
        shortLabel: "特",
        category: "day",
        workSegments: [{ start: "09:00", end: "18:00" }],
        breaks: [],
        nominalHours: 8,
      },
    ]);
    expect(list[0].shortLabel).toBe("特");
  });
});
