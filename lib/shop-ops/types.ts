import type { SiteId } from "@/lib/sites";

export type ShopRecordStatus = "pending" | "closed";

export const SHOP_STATUS_LABELS: Record<ShopRecordStatus, string> = {
  pending: "待處理",
  closed: "已處理",
};

/** 店務需求分頁順序：日常採購放最後 */
export const SHOP_OPS_TAB_KEYS = ["medicine", "customer", "fulfillment", "procurement"] as const;
export type ShopOpsTabKey = (typeof SHOP_OPS_TAB_KEYS)[number];

export function canDeleteShopRecord(createdBy: string, userId: string, isManager: boolean): boolean {
  return isManager || createdBy === userId;
}

export type ProcurementCategory = {
  id: string;
  siteId: SiteId;
  name: string;
  isActive: boolean;
};

export type ProcurementItem = {
  id: string;
  siteId: SiteId;
  categoryId: string | null;
  categoryName: string;
  itemName: string;
  quantity: number;
  unit: string;
  note: string;
  status: ShopRecordStatus;
  createdBy: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
};

export const DEFAULT_PROCUREMENT_CATEGORY_NAMES = [
  "文具",
  "影印紙",
  "貼紙",
  "清潔用品",
  "其他",
] as const;

export type MedicineKind = "prepack" | "shortage" | "below_stock";
export type MedicineQtyMode = "direct" | "refill";

export const MEDICINE_KIND_LABELS: Record<MedicineKind, string> = {
  prepack: "預包",
  shortage: "欠藥",
  below_stock: "低於庫存",
};

export const MEDICINE_QTY_MODE_LABELS: Record<MedicineQtyMode, string> = {
  direct: "直接填數量",
  refill: "第二次／第三次領藥（IC02／IC03）",
};

export type MedicineRequest = {
  id: string;
  siteId: SiteId;
  kind: MedicineKind;
  itemName: string;
  nhiCode: string;
  qtyMode: MedicineQtyMode;
  quantity: number | null;
  unit: string;
  useIc02: boolean;
  ic02Qty: number | null;
  useIc03: boolean;
  ic03Qty: number | null;
  currentStock: number | null;
  contactPhone: string;
  ordered: boolean;
  goodsArrived: boolean;
  notified: boolean;
  orderedAt: string | null;
  goodsArrivedAt: string | null;
  notifiedAt: string | null;
  note: string;
  status: ShopRecordStatus;
  createdBy: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type CustomerPaymentStatus = "paid" | "unpaid";

export const CUSTOMER_PAYMENT_LABELS: Record<CustomerPaymentStatus, string> = {
  unpaid: "未付款",
  paid: "已付款",
};

export type CustomerUrgency = "normal" | "urgent";

export const CUSTOMER_URGENCY_LABELS: Record<CustomerUrgency, string> = {
  normal: "一般",
  urgent: "緊急",
};

export type CustomerOrder = {
  id: string;
  siteId: SiteId;
  customerName: string;
  customerPhone: string;
  handlerId: string;
  productName: string;
  nhiCode: string;
  quantity: number;
  unit: string;
  amount: number;
  paymentStatus: CustomerPaymentStatus;
  urgency: CustomerUrgency;
  wantedArriveDate: string | null;
  ordered: boolean;
  goodsArrived: boolean;
  notified: boolean;
  pickedUp: boolean;
  orderedAt: string | null;
  goodsArrivedAt: string | null;
  notifiedAt: string | null;
  pickedUpAt: string | null;
  note: string;
  status: ShopRecordStatus;
  createdBy: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
};

export type FulfillmentFilter =
  | "all"
  | "not_ordered"
  | "not_arrived"
  | "arrived_unnotified"
  | "notified_unpicked"
  | "picked";

export const FULFILLMENT_FILTER_LABELS: Record<FulfillmentFilter, string> = {
  all: "全部",
  not_ordered: "未訂貨",
  not_arrived: "已訂未到",
  arrived_unnotified: "已到貨未通知",
  notified_unpicked: "已通知未拿",
  picked: "已拿",
};

export function fulfillmentStage(row: CustomerOrder): Exclude<FulfillmentFilter, "all"> {
  if (row.pickedUp) return "picked";
  if (row.notified) return "notified_unpicked";
  if (row.goodsArrived) return "arrived_unnotified";
  if (row.ordered) return "not_arrived";
  return "not_ordered";
}

export function matchesFulfillmentFilter(row: CustomerOrder, filter: FulfillmentFilter): boolean {
  if (filter === "all") return true;
  return fulfillmentStage(row) === filter;
}

export function formatFulfillmentMarks(row: CustomerOrder): string {
  return [
    row.ordered ? "已訂貨" : "未訂貨",
    row.goodsArrived ? "已到貨" : "未到貨",
    row.notified ? "已通知" : "未通知",
    row.pickedUp ? "已拿" : "未拿",
  ].join("／");
}

export function isCustomerFulfillmentComplete(row: Pick<
  CustomerOrder,
  "ordered" | "goodsArrived" | "notified" | "pickedUp"
>): boolean {
  return Boolean(row.ordered && row.goodsArrived && row.notified && row.pickedUp);
}

export function sortCustomerOrders<T extends CustomerOrder>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const urgentDelta = Number(b.urgency === "urgent") - Number(a.urgency === "urgent");
    if (urgentDelta !== 0) return urgentDelta;
    const createdDelta = String(a.createdAt).localeCompare(String(b.createdAt));
    if (createdDelta !== 0) return createdDelta;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function sortByCreatedAtAsc<T extends { createdAt: string; id?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const createdDelta = String(a.createdAt).localeCompare(String(b.createdAt));
    if (createdDelta !== 0) return createdDelta;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

export const SHOP_OPS_TZ = "Asia/Taipei";

export type DatePreset = "all" | "today" | "7d" | "month" | "custom";

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "全部日期",
  today: "今天",
  "7d": "近 7 天",
  month: "本月",
  custom: "自訂",
};

export function toTaipeiDateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_OPS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatCreatedStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = toTaipeiDateKey(iso).replace(/-/g, "/");
  if (!date) return iso;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHOP_OPS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${date} ${time}`;
}

export function shiftDateKey(key: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function datePresetRange(
  preset: DatePreset,
  customFrom = "",
  customTo = "",
  now = new Date()
): { from: string | null; to: string | null } {
  if (preset === "all") return { from: null, to: null };
  const today = toTaipeiDateKey(now.toISOString());
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") return { from: shiftDateKey(today, -6), to: today };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  const from = /^\d{4}-\d{2}-\d{2}$/.test(customFrom) ? customFrom : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? customTo : null;
  return { from, to };
}

export function matchesCreatedDate(
  iso: string,
  range: { from: string | null; to: string | null }
): boolean {
  const key = toTaipeiDateKey(iso);
  if (!key) return false;
  if (range.from && key < range.from) return false;
  if (range.to && key > range.to) return false;
  return true;
}

export const CUSTOMER_EXPORT_HEADERS = [
  "登記時間",
  "緊急",
  "希望到貨",
  "客人",
  "電話",
  "商品",
  "健保碼",
  "數量",
  "單位",
  "金額",
  "付款",
  "訂貨",
  "到貨",
  "通知",
  "已拿",
  "接手人",
  "備註",
  "狀態",
] as const;

export function formatWantedArriveDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  return isoDate.slice(0, 10).replace(/-/g, "/");
}

export function parsePositiveNumber(raw: unknown): number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1000) / 1000;
}

export function parseNonNegativeNumber(raw: unknown): number | null {
  if (raw === "" || raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000) / 1000;
}

export function validateMedicineDraft(input: {
  itemName: string;
  kind: MedicineKind;
  qtyMode: MedicineQtyMode;
  quantity: unknown;
  useIc02: boolean;
  ic02Qty: unknown;
  useIc03: boolean;
  ic03Qty: unknown;
  currentStock: unknown;
  contactPhone?: string;
}): string | null {
  if (!input.itemName.trim()) return "請填藥名／品名";
  if (input.kind === "shortage" && !String(input.contactPhone ?? "").trim()) {
    return "欠藥請留聯絡電話";
  }
  if (input.kind === "below_stock") {
    if (parseNonNegativeNumber(input.currentStock) == null) {
      return "低於庫存請填現存數量（可為 0）";
    }
    return null;
  }
  if (input.qtyMode === "direct") {
    if (parsePositiveNumber(input.quantity) == null) return "請填數量";
    return null;
  }
  if (!input.useIc02 && !input.useIc03) {
    return "預包／欠藥請勾選第二次（IC02）或第三次（IC03），或改為直接填數量";
  }
  if (input.useIc02 && parsePositiveNumber(input.ic02Qty) == null) {
    return "已勾第二次（IC02），請填數量";
  }
  if (input.useIc03 && parsePositiveNumber(input.ic03Qty) == null) {
    return "已勾第三次（IC03），請填數量";
  }
  return null;
}

export function formatMedicineQty(row: MedicineRequest): string {
  const unit = row.unit?.trim() ? ` ${row.unit.trim()}` : "";
  if (row.kind === "below_stock") {
    return `現存 ${row.currentStock ?? 0}${unit}`;
  }
  if (row.qtyMode === "refill") {
    const parts: string[] = [];
    if (row.useIc02) parts.push(`IC02 第二次 ${row.ic02Qty ?? 0}${unit}`);
    if (row.useIc03) parts.push(`IC03 第三次 ${row.ic03Qty ?? 0}${unit}`);
    return parts.join("／") || "—";
  }
  return `${row.quantity ?? 0}${unit}`;
}

export function validateProcurementDraft(input: {
  categoryId: string;
  itemName: string;
  quantity: unknown;
}): string | null {
  if (!input.categoryId) return "請選類別";
  if (!input.itemName.trim()) return "請填品名";
  if (parsePositiveNumber(input.quantity) == null) return "請填數量";
  return null;
}

export function validateCustomerDraft(input: {
  customerName: string;
  customerPhone: string;
  productName: string;
  quantity: unknown;
  amount: unknown;
  urgency?: CustomerUrgency;
  wantedArriveDate?: string;
}): string | null {
  if (!input.customerName.trim()) return "請填客人姓名";
  if (!input.customerPhone.trim()) return "請填電話";
  if (!input.productName.trim()) return "請填商品";
  if (parsePositiveNumber(input.quantity) == null) return "請填數量";
  if (parseNonNegativeNumber(input.amount) == null) return "請填金額（可為 0）";
  if (input.urgency === "urgent" && input.wantedArriveDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.wantedArriveDate)) {
      return "希望到貨日格式不正確";
    }
  }
  return null;
}

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("zh-Hant", { maximumFractionDigits: 2 })}`;
}
