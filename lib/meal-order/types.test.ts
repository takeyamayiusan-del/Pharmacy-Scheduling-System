import { describe, expect, it } from "vitest";
import {
  buildMealOrderBulletinContent,
  clampMealOrderQuantity,
  defaultItemCategoryForOrder,
  formatAggregateNames,
  formatOrderLineSummary,
  itemCategoryLockedForOrder,
  type MealOrderLine,
} from "@/lib/meal-order/types";

describe("meal-order self-fill", () => {
  it("飲料活動預設填飲料、便當活動預設填便當", () => {
    expect(defaultItemCategoryForOrder("drink")).toBe("drink");
    expect(defaultItemCategoryForOrder("bento")).toBe("bento");
    expect(defaultItemCategoryForOrder("both")).toBe("drink");
    expect(itemCategoryLockedForOrder("drink")).toBe(true);
    expect(itemCategoryLockedForOrder("bento")).toBe(true);
    expect(itemCategoryLockedForOrder("both")).toBe(false);
  });

  it("飲料摘要含甜度冰塊，便當不含", () => {
    const drink: MealOrderLine = {
      id: "1",
      orderId: "o",
      siteId: "jiji",
      orderedBy: "u",
      forUserId: "u",
      forName: "小明",
      itemId: null,
      itemName: "珍珠奶茶",
      category: "drink",
      sweetness: "微糖",
      ice: "少冰",
      note: "",
      createdAt: "",
    };
    const bento: MealOrderLine = {
      ...drink,
      id: "2",
      itemName: "排骨便當",
      category: "bento",
      sweetness: "",
      ice: "",
      note: "加蛋",
    };
    expect(formatOrderLineSummary(drink)).toBe("珍珠奶茶（微糖／少冰）");
    expect(formatOrderLineSummary(bento)).toBe("排骨便當（加蛋）");
  });

  it("公告請員工看菜單自行填寫", () => {
    const text = buildMealOrderBulletinContent({
      orderDate: "2026-08-17",
      vendorName: "清心",
      orderCategory: "drink",
    });
    expect(text).toMatch(/自行填寫/);
    expect(text).toMatch(/甜度冰塊/);
    expect(text).not.toMatch(/點選品項/);
  });

  it("杯數限制 1～10", () => {
    expect(clampMealOrderQuantity(3)).toBe(3);
    expect(clampMealOrderQuantity(0)).toBe(1);
    expect(clampMealOrderQuantity(99)).toBe(10);
    expect(clampMealOrderQuantity("2")).toBe(2);
  });

  it("同一人多杯合併顯示", () => {
    expect(formatAggregateNames(["小明", "小明", "小華"])).toBe("小明×2、小華");
  });
});
