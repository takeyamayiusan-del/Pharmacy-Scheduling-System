import type { SiteId } from "@/lib/sites";

export type MealVendorCategory = "drink" | "bento" | "both";
export type MealItemCategory = "drink" | "bento";
export type MealOrderCategory = "drink" | "bento" | "both";
export type MealOrderStatus = "open" | "ordered" | "closed";

export type MealVendor = {
  id: string;
  siteId: SiteId;
  name: string;
  category: MealVendorCategory;
  phone: string;
  address: string;
  menuUrl: string;
  note: string;
  isActive: boolean;
};

export type MealMenuItem = {
  id: string;
  vendorId: string;
  siteId: SiteId;
  name: string;
  category: MealItemCategory;
  price: number;
  isActive: boolean;
  sortOrder: number;
};

export type MealTaxProfile = {
  id: string;
  siteId: SiteId;
  companyName: string;
  taxId: string;
  note: string;
  isActive: boolean;
};

export type MealOrder = {
  id: string;
  siteId: SiteId;
  vendorId: string;
  title: string;
  orderDate: string;
  orderCategory: MealOrderCategory;
  budgetNote: string;
  note: string;
  taxProfileId: string | null;
  taxCompanyName: string;
  taxId: string;
  status: MealOrderStatus;
  createdBy: string;
  bulletinId: string | null;
  orderedBy: string | null;
  orderedAt: string | null;
  createdAt: string;
};

export type MealOrderLine = {
  id: string;
  orderId: string;
  siteId: SiteId;
  orderedBy: string;
  forUserId: string | null;
  forName: string;
  itemId: string | null;
  itemName: string;
  category: MealItemCategory;
  sweetness: string;
  ice: string;
  note: string;
  createdAt: string;
};

export const DRINK_SWEETNESS_OPTIONS = [
  "無糖",
  "微糖",
  "半糖",
  "少糖",
  "全糖",
] as const;

export const DRINK_ICE_OPTIONS = [
  "去冰",
  "微冰",
  "少冰",
  "正常冰",
  "熱",
] as const;

export const VENDOR_CATEGORY_LABELS: Record<MealVendorCategory, string> = {
  drink: "飲料店",
  bento: "便當店",
  both: "飲料＋便當",
};

export const ORDER_CATEGORY_LABELS: Record<MealOrderCategory, string> = {
  drink: "飲料",
  bento: "便當",
  both: "飲料＋便當",
};

export const ITEM_CATEGORY_LABELS: Record<MealItemCategory, string> = {
  drink: "飲料",
  bento: "便當",
};

export const ORDER_STATUS_LABELS: Record<MealOrderStatus, string> = {
  open: "開放點選中",
  ordered: "已訂購",
  closed: "已結束",
};

export function todayYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function vendorMatchesOrderCategory(
  vendorCategory: MealVendorCategory,
  orderCategory: MealOrderCategory
): boolean {
  if (orderCategory === "both") return true;
  if (vendorCategory === "both") return true;
  return vendorCategory === orderCategory;
}

/** 活動類別決定員工填寫時預設是飲料還是便當；「飲料＋便當」先預設飲料，可再改。 */
export function defaultItemCategoryForOrder(
  orderCategory: MealOrderCategory
): MealItemCategory {
  return orderCategory === "bento" ? "bento" : "drink";
}

export function itemCategoryLockedForOrder(
  orderCategory: MealOrderCategory
): boolean {
  return orderCategory !== "both";
}

/** 一次加入的杯數／份數（同品項不用重填） */
export const MEAL_ORDER_QTY_MAX = 10;

export function clampMealOrderQuantity(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MEAL_ORDER_QTY_MAX, Math.max(1, n));
}

export function mealOrderQtyUnit(category: MealItemCategory): string {
  return category === "drink" ? "杯" : "份";
}

/** 總表人名：同一人多杯顯示「小明×3」 */
export function formatAggregateNames(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name}×${count}` : name))
    .join("、");
}

export function formatOrderLineSummary(line: MealOrderLine): string {
  if (line.category === "drink") {
    const opts = [line.sweetness, line.ice].filter(Boolean).join("／");
    return opts ? `${line.itemName}（${opts}）` : line.itemName;
  }
  return line.note ? `${line.itemName}（${line.note}）` : line.itemName;
}

/** 合併相同品項＋規格，方便負責人下單 */
export function aggregateOrderLines(lines: MealOrderLine[]): Array<{
  key: string;
  label: string;
  count: number;
  names: string[];
}> {
  const map = new Map<
    string,
    { key: string; label: string; count: number; names: string[] }
  >();
  for (const line of lines) {
    const label = formatOrderLineSummary(line);
    const key = `${line.category}|${label}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.names.push(line.forName);
    } else {
      map.set(key, { key, label, count: 1, names: [line.forName] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
}

export function buildMealOrderBulletinContent(input: {
  orderDate: string;
  vendorName: string;
  orderCategory?: MealOrderCategory;
  budgetNote?: string;
  note?: string;
  taxCompanyName?: string;
  taxId?: string;
}): string {
  const lines = [
    `訂餐日期：${input.orderDate.replace(/-/g, "/")}`,
    `店家：${input.vendorName}`,
  ];
  if (input.orderCategory) {
    lines.push(`類別：${ORDER_CATEGORY_LABELS[input.orderCategory]}`);
  }
  if (input.taxCompanyName?.trim() || input.taxId?.trim()) {
    lines.push(
      `統編／抬頭：${[input.taxCompanyName?.trim(), input.taxId?.trim()].filter(Boolean).join(" ")}`
    );
  }
  if (input.budgetNote?.trim()) lines.push(`金額上限：${input.budgetNote.trim()}`);
  if (input.note?.trim()) lines.push(input.note.trim());
  lines.push("請看菜單後自行填寫要喝／吃什麼（飲料選甜度冰塊；便當不用）。可幫同事代點、可點多份。");
  return lines.join("\n");
}

/** 台灣統編：8 碼數字（寬鬆檢查，允許先存再說） */
export function normalizeTaxId(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export function isPlausibleTaxId(raw: string): boolean {
  const v = normalizeTaxId(raw);
  return /^\d{8}$/.test(v);
}
