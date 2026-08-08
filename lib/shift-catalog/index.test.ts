import { describe, expect, it } from "vitest";
import {
  createEmptyCatalogShift,
  formatCatalogShiftSummary,
  getHeadStoreShiftTemplate,
  parseCatalogShifts,
} from "@/lib/shift-catalog";

describe("shift-catalog", () => {
  it("loads head-store template with work segments", () => {
    const list = getHeadStoreShiftTemplate();
    expect(list.length).toBeGreaterThan(10);
    expect(list.every((s) => s.name && s.workSegments.length > 0)).toBe(true);
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
  });
});
