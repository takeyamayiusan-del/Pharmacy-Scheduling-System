import { createClient } from "@/lib/supabase/client";
import type { SiteId } from "@/lib/sites";
import {
  DEFAULT_PROCUREMENT_CATEGORY_NAMES,
  parseNonNegativeNumber,
  parsePositiveNumber,
  validateCustomerDraft,
  validateMedicineDraft,
  validateProcurementDraft,
  sortCustomerOrders,
  type CustomerOrder,
  type CustomerPaymentStatus,
  type CustomerUrgency,
  type MedicineKind,
  type MedicineQtyMode,
  type MedicineRequest,
  type ProcurementCategory,
  type ProcurementItem,
  type ShopRecordStatus,
} from "@/lib/shop-ops/types";

function mapCategory(r: Record<string, unknown>): ProcurementCategory {
  return {
    id: String(r.id),
    siteId: r.site_id as SiteId,
    name: String(r.name ?? ""),
    isActive: Boolean(r.is_active ?? true),
  };
}

function mapProcurement(r: Record<string, unknown>): ProcurementItem {
  return {
    id: String(r.id),
    siteId: r.site_id as SiteId,
    categoryId: r.category_id ? String(r.category_id) : null,
    categoryName: String(r.category_name ?? ""),
    itemName: String(r.item_name ?? ""),
    quantity: Number(r.quantity ?? 0),
    unit: String(r.unit ?? ""),
    note: String(r.note ?? ""),
    status: (r.status as ShopRecordStatus) || "pending",
    createdBy: String(r.created_by),
    closedBy: r.closed_by ? String(r.closed_by) : null,
    closedAt: r.closed_at ? String(r.closed_at) : null,
    createdAt: String(r.created_at),
  };
}

function mapMedicine(r: Record<string, unknown>): MedicineRequest {
  return {
    id: String(r.id),
    siteId: r.site_id as SiteId,
    kind: (r.kind as MedicineKind) || "shortage",
    itemName: String(r.item_name ?? ""),
    nhiCode: String(r.nhi_code ?? ""),
    qtyMode: (r.qty_mode as MedicineQtyMode) || "direct",
    quantity: r.quantity == null ? null : Number(r.quantity),
    unit: String(r.unit ?? ""),
    useIc02: Boolean(r.use_ic02),
    ic02Qty: r.ic02_qty == null ? null : Number(r.ic02_qty),
    useIc03: Boolean(r.use_ic03),
    ic03Qty: r.ic03_qty == null ? null : Number(r.ic03_qty),
    currentStock: r.current_stock == null ? null : Number(r.current_stock),
    contactPhone: String(r.contact_phone ?? ""),
    ordered: Boolean(r.ordered),
    goodsArrived: Boolean(r.goods_arrived),
    notified: Boolean(r.notified),
    orderedAt: r.ordered_at ? String(r.ordered_at) : null,
    goodsArrivedAt: r.goods_arrived_at ? String(r.goods_arrived_at) : null,
    notifiedAt: r.notified_at ? String(r.notified_at) : null,
    note: String(r.note ?? ""),
    status: (r.status as ShopRecordStatus) || "pending",
    createdBy: String(r.created_by),
    closedBy: r.closed_by ? String(r.closed_by) : null,
    closedAt: r.closed_at ? String(r.closed_at) : null,
    createdAt: String(r.created_at),
  };
}

function mapCustomer(r: Record<string, unknown>): CustomerOrder {
  const wanted = r.wanted_arrive_date ? String(r.wanted_arrive_date).slice(0, 10) : "";
  return {
    id: String(r.id),
    siteId: r.site_id as SiteId,
    customerName: String(r.customer_name ?? ""),
    customerPhone: String(r.customer_phone ?? ""),
    handlerId: String(r.handler_id),
    productName: String(r.product_name ?? ""),
    nhiCode: String(r.nhi_code ?? ""),
    quantity: Number(r.quantity ?? 0),
    unit: String(r.unit ?? ""),
    amount: Number(r.amount ?? 0),
    paymentStatus: (r.payment_status as CustomerPaymentStatus) || "unpaid",
    urgency: r.urgency === "urgent" ? "urgent" : "normal",
    wantedArriveDate: /^\d{4}-\d{2}-\d{2}$/.test(wanted) ? wanted : null,
    ordered: Boolean(r.ordered),
    goodsArrived: Boolean(r.goods_arrived),
    notified: Boolean(r.notified),
    pickedUp: Boolean(r.picked_up),
    orderedAt: r.ordered_at ? String(r.ordered_at) : null,
    goodsArrivedAt: r.goods_arrived_at ? String(r.goods_arrived_at) : null,
    notifiedAt: r.notified_at ? String(r.notified_at) : null,
    pickedUpAt: r.picked_up_at ? String(r.picked_up_at) : null,
    note: String(r.note ?? ""),
    status: (r.status as ShopRecordStatus) || "pending",
    createdBy: String(r.created_by),
    closedBy: r.closed_by ? String(r.closed_by) : null,
    closedAt: r.closed_at ? String(r.closed_at) : null,
    createdAt: String(r.created_at),
  };
}

export async function loadProcurementCategories(
  siteId: SiteId
): Promise<ProcurementCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_procurement_categories")
    .select("*")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => mapCategory(r as Record<string, unknown>));
}

export async function ensureDefaultProcurementCategories(input: {
  siteId: SiteId;
  userId: string;
}): Promise<ProcurementCategory[]> {
  const existing = await loadProcurementCategories(input.siteId);
  if (existing.length > 0) return existing;
  const supabase = createClient();
  const { error } = await supabase.from("shop_procurement_categories").insert(
    DEFAULT_PROCUREMENT_CATEGORY_NAMES.map((name) => ({
      site_id: input.siteId,
      name,
      created_by: input.userId,
    }))
  );
  if (error && !String(error.message).includes("duplicate")) throw error;
  return loadProcurementCategories(input.siteId);
}

export async function createProcurementCategory(input: {
  siteId: SiteId;
  name: string;
  createdBy: string;
}): Promise<ProcurementCategory> {
  const name = input.name.trim();
  if (!name) throw new Error("請填類別名稱");
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_procurement_categories")
    .insert({
      site_id: input.siteId,
      name,
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapCategory(data as Record<string, unknown>);
}

export async function deactivateProcurementCategory(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("shop_procurement_categories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function loadProcurementItems(siteId: SiteId): Promise<ProcurementItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_procurement_items")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw error;
  return (data ?? []).map((r) => mapProcurement(r as Record<string, unknown>));
}

export async function createProcurementItem(input: {
  siteId: SiteId;
  categoryId: string;
  categoryName: string;
  itemName: string;
  quantity: unknown;
  unit?: string;
  note?: string;
  createdBy: string;
}): Promise<ProcurementItem> {
  const err = validateProcurementDraft(input);
  if (err) throw new Error(err);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_procurement_items")
    .insert({
      site_id: input.siteId,
      category_id: input.categoryId,
      category_name: input.categoryName.trim(),
      item_name: input.itemName.trim(),
      quantity: parsePositiveNumber(input.quantity),
      unit: input.unit?.trim() ?? "",
      note: input.note?.trim() ?? "",
      status: "pending",
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapProcurement(data as Record<string, unknown>);
}

export async function updateProcurementItem(input: {
  id: string;
  categoryId: string;
  categoryName: string;
  itemName: string;
  quantity: unknown;
  unit?: string;
  note?: string;
}): Promise<ProcurementItem> {
  const err = validateProcurementDraft(input);
  if (err) throw new Error(err);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_procurement_items")
    .update({
      category_id: input.categoryId,
      category_name: input.categoryName.trim(),
      item_name: input.itemName.trim(),
      quantity: parsePositiveNumber(input.quantity),
      unit: input.unit?.trim() ?? "",
      note: input.note?.trim() ?? "",
    })
    .eq("id", input.id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error) throw error;
  return mapProcurement(data as Record<string, unknown>);
}

export async function loadMedicineRequests(siteId: SiteId): Promise<MedicineRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_medicine_requests")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw error;
  return (data ?? []).map((r) => mapMedicine(r as Record<string, unknown>));
}

export async function createMedicineRequest(input: {
  siteId: SiteId;
  kind: MedicineKind;
  itemName: string;
  nhiCode?: string;
  qtyMode: MedicineQtyMode;
  quantity: unknown;
  unit?: string;
  useIc02: boolean;
  ic02Qty: unknown;
  useIc03: boolean;
  ic03Qty: unknown;
  currentStock: unknown;
  note?: string;
  contactPhone?: string;
  createdBy: string;
}): Promise<MedicineRequest> {
  const err = validateMedicineDraft(input);
  if (err) throw new Error(err);
  const isBelow = input.kind === "below_stock";
  const refill = !isBelow && input.qtyMode === "refill";
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_medicine_requests")
    .insert({
      site_id: input.siteId,
      kind: input.kind,
      item_name: input.itemName.trim(),
      nhi_code: input.nhiCode?.trim() ?? "",
      qty_mode: isBelow ? "direct" : input.qtyMode,
      quantity: isBelow || refill ? null : parsePositiveNumber(input.quantity),
      unit: input.unit?.trim() ?? "",
      use_ic02: refill && input.useIc02,
      ic02_qty: refill && input.useIc02 ? parsePositiveNumber(input.ic02Qty) : null,
      use_ic03: refill && input.useIc03,
      ic03_qty: refill && input.useIc03 ? parsePositiveNumber(input.ic03Qty) : null,
      current_stock: isBelow ? parseNonNegativeNumber(input.currentStock) : null,
      contact_phone: input.kind === "shortage" ? input.contactPhone?.trim() ?? "" : "",
      note: input.note?.trim() ?? "",
      status: "pending",
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapMedicine(data as Record<string, unknown>);
}

function medicinePayload(input: {
  kind: MedicineKind;
  itemName: string;
  nhiCode?: string;
  qtyMode: MedicineQtyMode;
  quantity: unknown;
  unit?: string;
  useIc02: boolean;
  ic02Qty: unknown;
  useIc03: boolean;
  ic03Qty: unknown;
  currentStock: unknown;
  note?: string;
  contactPhone?: string;
}) {
  const isBelow = input.kind === "below_stock";
  const refill = !isBelow && input.qtyMode === "refill";
  return {
    kind: input.kind,
    item_name: input.itemName.trim(),
    nhi_code: input.nhiCode?.trim() ?? "",
    qty_mode: isBelow ? "direct" : input.qtyMode,
    quantity: isBelow || refill ? null : parsePositiveNumber(input.quantity),
    unit: input.unit?.trim() ?? "",
    use_ic02: refill && input.useIc02,
    ic02_qty: refill && input.useIc02 ? parsePositiveNumber(input.ic02Qty) : null,
    use_ic03: refill && input.useIc03,
    ic03_qty: refill && input.useIc03 ? parsePositiveNumber(input.ic03Qty) : null,
    current_stock: isBelow ? parseNonNegativeNumber(input.currentStock) : null,
    contact_phone: input.kind === "shortage" ? input.contactPhone?.trim() ?? "" : "",
    note: input.note?.trim() ?? "",
  };
}

export async function updateMedicineRequest(input: {
  id: string;
  kind: MedicineKind;
  itemName: string;
  nhiCode?: string;
  qtyMode: MedicineQtyMode;
  quantity: unknown;
  unit?: string;
  useIc02: boolean;
  ic02Qty: unknown;
  useIc03: boolean;
  ic03Qty: unknown;
  currentStock: unknown;
  note?: string;
  contactPhone?: string;
}): Promise<MedicineRequest> {
  const err = validateMedicineDraft(input);
  if (err) throw new Error(err);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_medicine_requests")
    .update(medicinePayload(input))
    .eq("id", input.id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error) throw error;
  return mapMedicine(data as Record<string, unknown>);
}

export async function loadCustomerOrders(siteId: SiteId): Promise<CustomerOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_customer_orders")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) throw error;
  return sortCustomerOrders((data ?? []).map((r) => mapCustomer(r as Record<string, unknown>)));
}

export async function createCustomerOrder(input: {
  siteId: SiteId;
  customerName: string;
  customerPhone: string;
  handlerId: string;
  productName: string;
  nhiCode?: string;
  quantity: unknown;
  unit?: string;
  amount: unknown;
  paymentStatus: CustomerPaymentStatus;
  urgency?: CustomerUrgency;
  wantedArriveDate?: string;
  note?: string;
}): Promise<CustomerOrder> {
  const err = validateCustomerDraft(input);
  if (err) throw new Error(err);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_customer_orders")
    .insert({
      site_id: input.siteId,
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      handler_id: input.handlerId,
      product_name: input.productName.trim(),
      nhi_code: input.nhiCode?.trim() ?? "",
      quantity: parsePositiveNumber(input.quantity),
      unit: input.unit?.trim() ?? "",
      amount: parseNonNegativeNumber(input.amount) ?? 0,
      payment_status: input.paymentStatus,
      urgency: input.urgency === "urgent" ? "urgent" : "normal",
      wanted_arrive_date:
        input.urgency === "urgent" && input.wantedArriveDate
          ? input.wantedArriveDate
          : null,
      note: input.note?.trim() ?? "",
      status: "pending",
      created_by: input.handlerId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapCustomer(data as Record<string, unknown>);
}

export async function updateCustomerOrder(input: {
  id: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  nhiCode?: string;
  quantity: unknown;
  unit?: string;
  amount: unknown;
  paymentStatus: CustomerPaymentStatus;
  urgency?: CustomerUrgency;
  wantedArriveDate?: string;
  note?: string;
}): Promise<CustomerOrder> {
  const err = validateCustomerDraft(input);
  if (err) throw new Error(err);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shop_customer_orders")
    .update({
      customer_name: input.customerName.trim(),
      customer_phone: input.customerPhone.trim(),
      product_name: input.productName.trim(),
      nhi_code: input.nhiCode?.trim() ?? "",
      quantity: parsePositiveNumber(input.quantity),
      unit: input.unit?.trim() ?? "",
      amount: parseNonNegativeNumber(input.amount) ?? 0,
      payment_status: input.paymentStatus,
      urgency: input.urgency === "urgent" ? "urgent" : "normal",
      wanted_arrive_date:
        input.urgency === "urgent" && input.wantedArriveDate
          ? input.wantedArriveDate
          : null,
      note: input.note?.trim() ?? "",
    })
    .eq("id", input.id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error) throw error;
  return mapCustomer(data as Record<string, unknown>);
}

export async function closeShopRecords(input: {
  table: "shop_procurement_items" | "shop_medicine_requests" | "shop_customer_orders";
  ids: string[];
  closedBy: string;
}): Promise<void> {
  if (input.ids.length === 0) return;
  const supabase = createClient();
  const { error } = await supabase
    .from(input.table)
    .update({
      status: "closed",
      closed_by: input.closedBy,
      closed_at: new Date().toISOString(),
    })
    .in("id", input.ids)
    .eq("status", "pending");
  if (error) throw error;
}

export async function deletePendingShopRecord(input: {
  table: "shop_procurement_items" | "shop_medicine_requests" | "shop_customer_orders";
  id: string;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from(input.table).delete().eq("id", input.id).eq("status", "pending");
  if (error) throw error;
}

export async function updateCustomerPayment(input: {
  id: string;
  paymentStatus: CustomerPaymentStatus;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("shop_customer_orders")
    .update({ payment_status: input.paymentStatus })
    .eq("id", input.id);
  if (error) throw error;
}

export async function updateCustomerFulfillment(input: {
  ids: string[];
  ordered?: boolean;
  goodsArrived?: boolean;
  notified?: boolean;
  pickedUp?: boolean;
}): Promise<void> {
  if (input.ids.length === 0) return;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (input.ordered !== undefined) {
    patch.ordered = input.ordered;
    patch.ordered_at = input.ordered ? now : null;
  }
  if (input.goodsArrived !== undefined) {
    patch.goods_arrived = input.goodsArrived;
    patch.goods_arrived_at = input.goodsArrived ? now : null;
  }
  if (input.notified !== undefined) {
    patch.notified = input.notified;
    patch.notified_at = input.notified ? now : null;
  }
  if (input.pickedUp !== undefined) {
    patch.picked_up = input.pickedUp;
    patch.picked_up_at = input.pickedUp ? now : null;
  }
  if (Object.keys(patch).length === 0) return;
  const supabase = createClient();
  const { error } = await supabase.from("shop_customer_orders").update(patch).in("id", input.ids);
  if (error) throw error;
}

export async function updateMedicineFulfillment(input: {
  ids: string[];
  ordered?: boolean;
  goodsArrived?: boolean;
  notified?: boolean;
}): Promise<void> {
  if (input.ids.length === 0) return;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  if (input.ordered !== undefined) {
    patch.ordered = input.ordered;
    patch.ordered_at = input.ordered ? now : null;
  }
  if (input.goodsArrived !== undefined) {
    patch.goods_arrived = input.goodsArrived;
    patch.goods_arrived_at = input.goodsArrived ? now : null;
  }
  if (input.notified !== undefined) {
    patch.notified = input.notified;
    patch.notified_at = input.notified ? now : null;
  }
  if (Object.keys(patch).length === 0) return;
  const supabase = createClient();
  const { error } = await supabase.from("shop_medicine_requests").update(patch).in("id", input.ids);
  if (error) throw error;
}
