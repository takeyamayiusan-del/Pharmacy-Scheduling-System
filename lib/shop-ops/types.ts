import type { SiteId } from "@/lib/sites";

export type ShopRecordStatus = "pending" | "closed";

export const SHOP_STATUS_LABELS: Record<ShopRecordStatus, string> = {
  pending: "待處理",
  closed: "已結單",
};

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
  goodsArrived: boolean;
  notified: boolean;
  pickedUp: boolean;
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
  | "not_arrived"
  | "arrived_unnotified"
  | "notified_unpicked"
  | "picked";

export const FULFILLMENT_FILTER_LABELS: Record<FulfillmentFilter, string> = {
  all: "全部",
  not_arrived: "未到貨",
  arrived_unnotified: "已到貨未通知",
  notified_unpicked: "已通知未拿",
  picked: "已拿",
};

export function fulfillmentStage(row: CustomerOrder): Exclude<FulfillmentFilter, "all"> {
  if (row.pickedUp) return "picked";
  if (row.notified) return "notified_unpicked";
  if (row.goodsArrived) return "arrived_unnotified";
  return "not_arrived";
}

export function matchesFulfillmentFilter(row: CustomerOrder, filter: FulfillmentFilter): boolean {
  if (filter === "all") return true;
  return fulfillmentStage(row) === filter;
}

export function formatFulfillmentMarks(row: CustomerOrder): string {
  return [
    row.goodsArrived ? "已到貨" : "未到貨",
    row.notified ? "已通知" : "未通知",
    row.pickedUp ? "已拿" : "未拿",
  ].join("／");
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
}): string | null {
  if (!input.itemName.trim()) return "請填藥名／品名";
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
}): string | null {
  if (!input.customerName.trim()) return "請填客人姓名";
  if (!input.customerPhone.trim()) return "請填電話";
  if (!input.productName.trim()) return "請填商品";
  if (parsePositiveNumber(input.quantity) == null) return "請填數量";
  if (parseNonNegativeNumber(input.amount) == null) return "請填金額（可為 0）";
  return null;
}

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("zh-Hant", { maximumFractionDigits: 2 })}`;
}
