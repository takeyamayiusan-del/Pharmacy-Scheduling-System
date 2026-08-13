import { describe, expect, it } from "vitest";
import { defaultStoreConfigForSite } from "@/lib/store-config";
import { previewAutoRest, countAutoRestDays, autoRestNeededDays, autoRestCellNote } from "@/lib/schedule/autoRestPreview";

describe("autoRestPreview", () => {
  it("八周超時會建議插入休假日", () => {
    const cfg = defaultStoreConfigForSite("jiji");
    const suggestions = previewAutoRest({
      year: 2026,
      month: 3,
      employees: [
        {
          id: "e1",
          name: "小華",
          role: "staff",
          workHoursRegime: "eight_week",
          hireDate: "2026-01-05",
          baselineShift: "B",
        },
      ],
      storeConfig: cfg,
      getShiftForDate: (date) => (date.endsWith("-01") && new Date(date).getDay() === 0 ? "X" : "A"),
    });
    expect(countAutoRestDays(suggestions)).toBeGreaterThan(0);
    expect(suggestions[0]?.employeeName).toBe("小華");
    expect(suggestions[0]?.excessHours).toBeGreaterThan(0);
  });

  it("正常工時未超標不建議播假", () => {
    const cfg = defaultStoreConfigForSite("zhushan");
    const suggestions = previewAutoRest({
      year: 2026,
      month: 3,
      employees: [
        {
          id: "e1",
          name: "小明",
          role: "staff",
          workHoursRegime: "standard",
          hireDate: "2026-01-05",
        },
      ],
      storeConfig: cfg,
      getShiftForDate: (date) => {
        const d = new Date(`${date}T12:00:00`);
        const day = d.getDay();
        return day === 0 || day === 6 ? "X" : "B";
      },
    });
    expect(countAutoRestDays(suggestions)).toBe(0);
  });

  it("超時以基準班時數換算天數，不是發補休時數", () => {
    expect(autoRestNeededDays(32, 8)).toBe(4);
    expect(autoRestNeededDays(9, 8)).toBe(2);
    expect(
      autoRestCellNote({
        regimeLabel: "八周變形工時",
        excessHours: 32,
        baselineShiftName: "白班5",
        baselineHours: 8,
      })
    ).toContain("超 32 小時");
  });
});
