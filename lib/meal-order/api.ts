import { createClient } from "@/lib/supabase/client";
import type { SiteId } from "@/lib/sites";
import {
  buildMealOrderBulletinContent,
  clampMealOrderQuantity,
  normalizeTaxId,
  type MealItemCategory,
  type MealMenuItem,
  type MealOrder,
  type MealOrderCategory,
  type MealOrderLine,
  type MealOrderStatus,
  type MealTaxProfile,
  type MealVendor,
  type MealVendorCategory,
} from "@/lib/meal-order/types";

function mapVendor(r: Record<string, unknown>): MealVendor {
  return {
    id: String(r.id),
    siteId: r.site_id as SiteId,
    name: String(r.name ?? ""),
    category: (r.category as MealVendorCategory) || "drink",
    phone: String(r.phone ?? ""),
    address: String(r.address ?? ""),
    menuUrl: String(r.menu_url ?? ""),
    note: String(r.note ?? ""),
    isActive: Boolean(r.is_active ?? true),
  };
}

function mapItem(r: Record<string, unknown>): MealMenuItem {
  return {
    id: String(r.id),
    vendorId: String(r.vendor_id),
    siteId: r.site_id as SiteId,
    name: String(r.name ?? ""),
    category: r.category as MealItemCategory,
    price: Number(r.price ?? 0),
    isActive: Boolean(r.is_active ?? true),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapTaxProfile(r: Record<string, unknown>): MealTaxProfile {
  return {
    id: String(r.id),
    siteId: r.site_id as SiteId,
    companyName: String(r.company_name ?? ""),
    taxId: String(r.tax_id ?? ""),
    note: String(r.note ?? ""),
    isActive: Boolean(r.is_active ?? true),
  };
}

function mapOrder(r: Record<string, unknown>): MealOrder {
  return {
    id: String(r.id),
    siteId: r.site_id as SiteId,
    vendorId: String(r.vendor_id),
    title: String(r.title ?? ""),
    orderDate: String(r.order_date).slice(0, 10),
    orderCategory: (r.order_category as MealOrderCategory) || "drink",
    budgetNote: String(r.budget_note ?? ""),
    note: String(r.note ?? ""),
    taxProfileId: r.tax_profile_id ? String(r.tax_profile_id) : null,
    taxCompanyName: String(r.tax_company_name ?? ""),
    taxId: String(r.tax_id ?? ""),
    status: r.status as MealOrderStatus,
    createdBy: String(r.created_by),
    bulletinId: r.bulletin_id ? String(r.bulletin_id) : null,
    orderedBy: r.ordered_by ? String(r.ordered_by) : null,
    orderedAt: r.ordered_at ? String(r.ordered_at) : null,
    createdAt: String(r.created_at),
  };
}

function mapLine(r: Record<string, unknown>): MealOrderLine {
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    siteId: r.site_id as SiteId,
    orderedBy: String(r.ordered_by),
    forUserId: r.for_user_id ? String(r.for_user_id) : null,
    forName: String(r.for_name ?? ""),
    itemId: r.item_id ? String(r.item_id) : null,
    itemName: String(r.item_name ?? ""),
    category: r.category as MealItemCategory,
    sweetness: String(r.sweetness ?? ""),
    ice: String(r.ice ?? ""),
    note: String(r.note ?? ""),
    createdAt: String(r.created_at),
  };
}

export async function loadMealVendors(siteId: SiteId): Promise<MealVendor[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meal_vendors")
    .select("*")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => mapVendor(r as Record<string, unknown>));
}

export async function createMealVendor(input: {
  siteId: SiteId;
  name: string;
  category: MealVendorCategory;
  phone?: string;
  address?: string;
  menuUrl?: string;
  note?: string;
  createdBy: string;
}): Promise<MealVendor> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meal_vendors")
    .insert({
      site_id: input.siteId,
      name: input.name.trim(),
      category: input.category,
      phone: input.phone?.trim() ?? "",
      address: input.address?.trim() ?? "",
      menu_url: input.menuUrl?.trim() ?? "",
      note: input.note?.trim() ?? "",
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapVendor(data as Record<string, unknown>);
}

export async function deactivateMealVendor(vendorId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("meal_vendors")
    .update({ is_active: false })
    .eq("id", vendorId);
  if (error) throw error;
}

export async function loadMenuItems(
  siteId: SiteId,
  vendorId: string
): Promise<MealMenuItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meal_menu_items")
    .select("*")
    .eq("site_id", siteId)
    .eq("vendor_id", vendorId)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => mapItem(r as Record<string, unknown>));
}

export async function createMenuItem(input: {
  siteId: SiteId;
  vendorId: string;
  name: string;
  category: MealItemCategory;
  price?: number;
}): Promise<MealMenuItem> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meal_menu_items")
    .insert({
      site_id: input.siteId,
      vendor_id: input.vendorId,
      name: input.name.trim(),
      category: input.category,
      price: input.price ?? 0,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapItem(data as Record<string, unknown>);
}

export async function deactivateMenuItem(itemId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("meal_menu_items")
    .update({ is_active: false })
    .eq("id", itemId);
  if (error) throw error;
}

export async function loadTaxProfiles(siteId: SiteId): Promise<MealTaxProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meal_tax_profiles")
    .select("*")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("company_name");
  if (error) throw error;
  return (data ?? []).map((r) => mapTaxProfile(r as Record<string, unknown>));
}

export async function createTaxProfile(input: {
  siteId: SiteId;
  companyName: string;
  taxId: string;
  note?: string;
  createdBy: string;
}): Promise<MealTaxProfile> {
  const supabase = createClient();
  const taxId = normalizeTaxId(input.taxId);
  const { data, error } = await supabase
    .from("meal_tax_profiles")
    .insert({
      site_id: input.siteId,
      company_name: input.companyName.trim(),
      tax_id: taxId,
      note: input.note?.trim() ?? "",
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapTaxProfile(data as Record<string, unknown>);
}

export async function deactivateTaxProfile(profileId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("meal_tax_profiles")
    .update({ is_active: false })
    .eq("id", profileId);
  if (error) throw error;
}

export async function loadMealOrders(siteId: SiteId): Promise<MealOrder[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meal_orders")
    .select("*")
    .eq("site_id", siteId)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapOrder(r as Record<string, unknown>));
}

export async function loadOrderLines(
  siteId: SiteId,
  orderIds: string[]
): Promise<MealOrderLine[]> {
  if (orderIds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("meal_order_lines")
    .select("*")
    .eq("site_id", siteId)
    .in("order_id", orderIds)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => mapLine(r as Record<string, unknown>));
}

export async function createMealOrderActivity(input: {
  siteId: SiteId;
  vendorId: string;
  vendorName: string;
  title: string;
  orderDate: string;
  orderCategory: MealOrderCategory;
  budgetNote?: string;
  note?: string;
  taxProfileId?: string | null;
  taxCompanyName?: string;
  taxId?: string;
  createdBy: string;
  publishBulletin: boolean;
}): Promise<MealOrder> {
  const supabase = createClient();
  const taxId = normalizeTaxId(input.taxId ?? "");
  const taxCompanyName = input.taxCompanyName?.trim() ?? "";
  const { data: orderRow, error: orderError } = await supabase
    .from("meal_orders")
    .insert({
      site_id: input.siteId,
      vendor_id: input.vendorId,
      title: input.title.trim(),
      order_date: input.orderDate,
      order_category: input.orderCategory,
      budget_note: input.budgetNote?.trim() ?? "",
      note: input.note?.trim() ?? "",
      tax_profile_id: input.taxProfileId || null,
      tax_company_name: taxCompanyName,
      tax_id: taxId,
      status: "open",
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (orderError) throw orderError;

  let bulletinId: string | null = null;
  if (input.publishBulletin) {
    const content = buildMealOrderBulletinContent({
      orderDate: input.orderDate,
      vendorName: input.vendorName,
      orderCategory: input.orderCategory,
      budgetNote: input.budgetNote,
      note: input.note,
      taxCompanyName,
      taxId,
    });
    const { data: bulletin, error: bulletinError } = await supabase
      .from("bulletin_board")
      .insert({
        author_id: input.createdBy,
        title: input.title.trim() || `今日訂餐｜${input.vendorName}`,
        content,
        type: "meal_order",
        status: "active",
        related_id: orderRow.id,
        is_urgent: true,
        is_pinned: false,
        target_type: "all",
        target_ids: [],
        site_id: input.siteId,
      })
      .select("id")
      .single();
    if (bulletinError) throw bulletinError;
    bulletinId = bulletin.id;
    await supabase
      .from("meal_orders")
      .update({ bulletin_id: bulletinId })
      .eq("id", orderRow.id);
  }

  return mapOrder({
    ...(orderRow as Record<string, unknown>),
    bulletin_id: bulletinId,
  });
}

export async function addMealOrderLine(input: {
  siteId: SiteId;
  orderId: string;
  orderedBy: string;
  forUserId: string | null;
  forName: string;
  itemName: string;
  category: MealItemCategory;
  sweetness?: string;
  ice?: string;
  note?: string;
  quantity?: number;
}): Promise<MealOrderLine[]> {
  const supabase = createClient();
  const isDrink = input.category === "drink";
  const quantity = clampMealOrderQuantity(input.quantity);
  const row = {
    order_id: input.orderId,
    site_id: input.siteId,
    ordered_by: input.orderedBy,
    for_user_id: input.forUserId,
    for_name: input.forName.trim(),
    item_id: null,
    item_name: input.itemName.trim(),
    category: input.category,
    sweetness: isDrink ? (input.sweetness ?? "") : "",
    ice: isDrink ? (input.ice ?? "") : "",
    note: input.note?.trim() ?? "",
  };
  const { data, error } = await supabase
    .from("meal_order_lines")
    .insert(Array.from({ length: quantity }, () => ({ ...row })))
    .select("*");
  if (error) throw error;
  return (data ?? []).map((r) => mapLine(r as Record<string, unknown>));
}

export async function deleteMealOrderLine(lineId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("meal_order_lines").delete().eq("id", lineId);
  if (error) throw error;
}

/** 標記已訂購：結束活動並封存公告 */
export async function markMealOrderOrdered(input: {
  orderId: string;
  userId: string;
  bulletinId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("meal_orders")
    .update({
      status: "ordered",
      ordered_by: input.userId,
      ordered_at: new Date().toISOString(),
    })
    .eq("id", input.orderId);
  if (error) throw error;

  if (input.bulletinId) {
    await supabase
      .from("bulletin_board")
      .update({ status: "archived" })
      .eq("id", input.bulletinId);
  } else {
    await supabase
      .from("bulletin_board")
      .update({ status: "archived" })
      .eq("related_id", input.orderId)
      .eq("type", "meal_order");
  }
}
