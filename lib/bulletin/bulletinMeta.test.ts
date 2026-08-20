import { describe, expect, it } from "vitest";
import {
  encodeMealOrderDate,
  parseMealOrderDate,
  shouldPopupMealOrderBulletin,
  stripMetaLines,
} from "@/lib/bulletin/bulletinMeta";

describe("meal order bulletin popup date", () => {
  it("從 meta 與正文解析訂餐日", () => {
    const encoded = encodeMealOrderDate("訂餐日期：2026/08/25\n店家：清心", "2026-08-25");
    expect(parseMealOrderDate(encoded)).toBe("2026-08-25");
    expect(stripMetaLines(encoded)).toContain("訂餐日期：2026/08/25");
    expect(stripMetaLines(encoded)).not.toMatch(/MEAL_DATE/);
    expect(parseMealOrderDate("訂餐日期：2026/8/5\n店家：清心")).toBe("2026-08-05");
  });

  it("只有訂餐當天才彈窗，公告仍可提前存在", () => {
    const future = encodeMealOrderDate("訂餐日期：2026/08/25", "2026-08-25");
    expect(shouldPopupMealOrderBulletin("meal_order", future, "2026-08-20")).toBe(false);
    expect(shouldPopupMealOrderBulletin("meal_order", future, "2026-08-25")).toBe(true);
    expect(shouldPopupMealOrderBulletin("announcement", future, "2026-08-20")).toBe(true);
    expect(shouldPopupMealOrderBulletin("meal_order", "沒有日期", "2026-08-25")).toBe(false);
  });
});
