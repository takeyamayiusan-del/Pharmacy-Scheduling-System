"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";
import { Coffee, Plus, Store, Trash2, UtensilsCrossed } from "lucide-react";
import { useApp } from "@/lib/context/AppContext";
import { HelpTip } from "@/components/ui/HelpTip";
import {
  addMealOrderLine,
  createMealOrderActivity,
  createMealVendor,
  createMenuItem,
  createTaxProfile,
  deactivateMealVendor,
  deactivateMenuItem,
  deactivateTaxProfile,
  deleteMealOrderLine,
  loadMealOrders,
  loadMealVendors,
  loadMenuItems,
  loadOrderLines,
  loadTaxProfiles,
  markMealOrderOrdered,
} from "@/lib/meal-order/api";
import {
  aggregateOrderLines,
  DRINK_ICE_OPTIONS,
  DRINK_SWEETNESS_OPTIONS,
  isPlausibleTaxId,
  ITEM_CATEGORY_LABELS,
  ORDER_CATEGORY_LABELS,
  ORDER_STATUS_LABELS,
  todayYmd,
  vendorMatchesOrderCategory,
  VENDOR_CATEGORY_LABELS,
  type MealItemCategory,
  type MealMenuItem,
  type MealOrder,
  type MealOrderCategory,
  type MealOrderLine,
  type MealTaxProfile,
  type MealVendor,
  type MealVendorCategory,
} from "@/lib/meal-order/types";

type TabKey = "today" | "vendors" | "tax" | "history";

type VendorFormState = {
  name: string;
  category: MealVendorCategory;
  phone: string;
  address: string;
  menuUrl: string;
  note: string;
};

type ItemFormState = {
  name: string;
  category: MealItemCategory;
  price: string;
};

const EMPTY_VENDOR_FORM: VendorFormState = {
  name: "",
  category: "drink",
  phone: "",
  address: "",
  menuUrl: "",
  note: "",
};

export default function MealOrderPage() {
  const {
    currentUser,
    employees,
    activeSiteId,
    loadBulletinItems,
  } = useApp();
  const searchParams = useSearchParams();
  const focusOrderId = searchParams.get("orderId");

  const [tab, setTab] = useState<TabKey>("today");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [vendors, setVendors] = useState<MealVendor[]>([]);
  const [orders, setOrders] = useState<MealOrder[]>([]);
  const [lines, setLines] = useState<MealOrderLine[]>([]);
  const [menuByVendor, setMenuByVendor] = useState<Record<string, MealMenuItem[]>>({});
  const [taxProfiles, setTaxProfiles] = useState<MealTaxProfile[]>([]);
  // 表單狀態放在頁面層：切換分頁／背景刷新時不要被清掉
  const [vendorForm, setVendorForm] = useState<VendorFormState>(EMPTY_VENDOR_FORM);
  const [itemForms, setItemForms] = useState<Record<string, ItemFormState>>({});
  const [taxForm, setTaxForm] = useState({ companyName: "", taxId: "", note: "" });

  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;
  const userId = currentUser?.id;

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const [vendorList, orderList, taxList] = await Promise.all([
        loadMealVendors(activeSiteId),
        loadMealOrders(activeSiteId),
        loadTaxProfiles(activeSiteId),
      ]);
      setVendors(vendorList);
      setOrders(orderList);
      setTaxProfiles(taxList);
      const openIds = orderList.filter((o) => o.status === "open").map((o) => o.id);
      const recentIds = orderList.slice(0, 8).map((o) => o.id);
      const lineIds = Array.from(new Set([...openIds, ...recentIds]));
      setLines(await loadOrderLines(activeSiteId, lineIds));

      const menuEntries = await Promise.all(
        vendorList.map(async (v) => [v.id, await loadMenuItems(activeSiteId, v.id)] as const)
      );
      const nextMenu: Record<string, MealMenuItem[]> = {};
      menuEntries.forEach(([id, items]) => {
        nextMenu[id] = items;
      });
      setMenuByVendor(nextMenu);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "載入訂餐資料失敗（請確認已套用資料庫 migration）");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeSiteId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (focusOrderId) setTab("today");
  }, [focusOrderId]);

  const today = todayYmd();
  const openOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "open" && (o.orderDate === today || o.orderDate > today)
      ),
    [orders, today]
  );
  const historyOrders = useMemo(
    () => orders.filter((o) => o.status !== "open" || o.orderDate < today),
    [orders, today]
  );

  const vendorMap = useMemo(() => {
    const map = new Map<string, MealVendor>();
    vendors.forEach((v) => map.set(v.id, v));
    return map;
  }, [vendors]);

  const staff = useMemo(
    () => employees.filter((e) => e.role !== "owner"),
    [employees]
  );

  if (!currentUser) return null;

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <div>
          <h1 className="app-page-title flex items-center gap-2">
            <Coffee className="h-6 w-6 text-sky-700" />
            訂餐
          </h1>
          <p className="app-meta mt-1">
            本店獨立訂餐系統。一場活動對應一家店；同日要飲料＋便當可開兩場。
          </p>
        </div>
      </div>

      <HelpTip
        title="訂餐怎麼用"
        hint="開活動 → 大家點選 → 負責人按已訂購"
        defaultOpen
        storageKey={`help:meal-order:${storageScope}`}
      >
        <p>1. 先在「店家與菜單」新增店家與品項（飲料可選甜度冰塊；便當用備註寫加飯／加蛋）。</p>
        <p>2. 任何人可發起訂餐活動：選<strong>類別</strong>、店家、日期、統編（可選）、金額上限說明，並發公告。</p>
        <p>3. 同日若要又訂飲料又訂便當：請開兩場活動（各選一家店），或類別選「飲料＋便當」。</p>
        <p>4. 廠商統編可在「統編」分頁自行新增／刪除；發布時直接選用。</p>
        <p>5. 大家可自點或多點，也可幫同事代點；負責人看總表下單後按「已訂購」結束，公告會自動收起。</p>
      </HelpTip>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["today", "今日／進行中"],
            ["vendors", "店家與菜單"],
            ["tax", "廠商統編"],
            ["history", "歷史訂單"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              tab === key
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-sky-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="app-card p-8 text-center text-slate-500">載入中...</div>
      ) : tab === "vendors" ? (
        <VendorsPanel
          vendors={vendors}
          menuByVendor={menuByVendor}
          busy={busy}
          setBusy={setBusy}
          vendorForm={vendorForm}
          setVendorForm={setVendorForm}
          itemForms={itemForms}
          setItemForms={setItemForms}
          onChanged={async () => {
            await refresh({ silent: true });
          }}
          siteId={activeSiteId}
          userId={currentUser.id}
        />
      ) : tab === "tax" ? (
        <TaxProfilesPanel
          profiles={taxProfiles}
          busy={busy}
          setBusy={setBusy}
          taxForm={taxForm}
          setTaxForm={setTaxForm}
          onChanged={async () => {
            await refresh({ silent: true });
          }}
          siteId={activeSiteId}
          userId={currentUser.id}
        />
      ) : tab === "history" ? (
        <HistoryPanel
          orders={historyOrders}
          lines={lines}
          vendorMap={vendorMap}
        />
      ) : (
        <TodayPanel
          openOrders={openOrders}
          allOrders={orders}
          lines={lines}
          vendors={vendors}
          menuByVendor={menuByVendor}
          vendorMap={vendorMap}
          taxProfiles={taxProfiles}
          staff={staff}
          currentUserId={currentUser.id}
          currentUserName={currentUser.name}
          siteId={activeSiteId}
          focusOrderId={focusOrderId}
          busy={busy}
          setBusy={setBusy}
          onChanged={async () => {
            await refresh({ silent: true });
            await loadBulletinItems();
          }}
        />
      )}
    </div>
  );
}

function VendorsPanel({
  vendors,
  menuByVendor,
  busy,
  setBusy,
  vendorForm,
  setVendorForm,
  itemForms,
  setItemForms,
  onChanged,
  siteId,
  userId,
}: {
  vendors: MealVendor[];
  menuByVendor: Record<string, MealMenuItem[]>;
  busy: boolean;
  setBusy: (v: boolean) => void;
  vendorForm: VendorFormState;
  setVendorForm: Dispatch<SetStateAction<VendorFormState>>;
  itemForms: Record<string, ItemFormState>;
  setItemForms: Dispatch<SetStateAction<Record<string, ItemFormState>>>;
  onChanged: () => Promise<void>;
  siteId: import("@/lib/sites").SiteId;
  userId: string;
}) {
  const addVendor = async () => {
    if (!vendorForm.name.trim() || busy) return;
    setBusy(true);
    try {
      await createMealVendor({
        siteId,
        createdBy: userId,
        ...vendorForm,
      });
      setVendorForm(EMPTY_VENDOR_FORM);
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增店家失敗");
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (vendor: MealVendor) => {
    const form = itemForms[vendor.id] ?? {
      name: "",
      category: vendor.category === "bento" ? "bento" : "drink",
      price: "",
    };
    if (!form.name.trim() || busy) return;
    setBusy(true);
    try {
      await createMenuItem({
        siteId,
        vendorId: vendor.id,
        name: form.name,
        category: form.category,
        price: Number(form.price) || 0,
      });
      setItemForms((prev) => ({
        ...prev,
        [vendor.id]: {
          name: "",
          category: form.category,
          price: "",
        },
      }));
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增品項失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="app-section-title flex items-center gap-2">
          <Store className="h-5 w-5 text-sky-700" />
          新增店家
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="店家名稱"
            value={vendorForm.name}
            onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
          />
          <select
            className="border rounded-xl px-3 py-2 text-sm"
            value={vendorForm.category}
            onChange={(e) =>
              setVendorForm({
                ...vendorForm,
                category: e.target.value as MealVendorCategory,
              })
            }
          >
            <option value="drink">飲料店</option>
            <option value="bento">便當店</option>
            <option value="both">飲料＋便當</option>
          </select>
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="電話"
            value={vendorForm.phone}
            onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="地址"
            value={vendorForm.address}
            onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
            placeholder="菜單網址（可選）"
            value={vendorForm.menuUrl}
            onChange={(e) => setVendorForm({ ...vendorForm, menuUrl: e.target.value })}
          />
        </div>
        <button
          type="button"
          disabled={busy || !vendorForm.name.trim()}
          onClick={() => void addVendor()}
          className="app-btn-primary"
        >
          <Plus className="h-4 w-4 mr-1" />
          新增店家
        </button>
      </div>

      {vendors.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">尚未建立店家</div>
      ) : (
        vendors.map((vendor) => {
          const items = menuByVendor[vendor.id] ?? [];
          const form = itemForms[vendor.id] ?? {
            name: "",
            category: (vendor.category === "bento" ? "bento" : "drink") as MealItemCategory,
            price: "",
          };
          return (
            <div key={vendor.id} className="app-card p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{vendor.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {VENDOR_CATEGORY_LABELS[vendor.category]}
                    {vendor.phone ? ` · ${vendor.phone}` : ""}
                    {vendor.address ? ` · ${vendor.address}` : ""}
                  </p>
                  {vendor.menuUrl && (
                    <a
                      href={vendor.menuUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-700 underline"
                    >
                      開啟菜單連結
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  className="text-slate-400 hover:text-rose-600 inline-flex items-center gap-1 text-sm"
                  title="刪除店家"
                  onClick={async () => {
                    if (!window.confirm(`刪除店家「${vendor.name}」？`)) return;
                    setBusy(true);
                    try {
                      await deactivateMealVendor(vendor.id);
                      await onChanged();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "刪除失敗");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  刪除
                </button>
              </div>

              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="text-xs text-slate-400 mr-2">
                        {ITEM_CATEGORY_LABELS[item.category]}
                      </span>
                      {item.name}
                      {item.price > 0 ? (
                        <span className="text-slate-500 ml-2">${item.price}</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      title="移除品項"
                      onClick={async () => {
                        if (!window.confirm(`移除「${item.name}」？`)) return;
                        setBusy(true);
                        try {
                          await deactivateMenuItem(item.id);
                          await onChanged();
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "移除失敗");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-sm text-slate-400">尚未新增品項</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <input
                  className="border rounded-xl px-3 py-2 text-sm sm:col-span-2"
                  placeholder="品項名稱"
                  value={form.name}
                  onChange={(e) =>
                    setItemForms((prev) => ({
                      ...prev,
                      [vendor.id]: { ...form, name: e.target.value },
                    }))
                  }
                />
                <select
                  className="border rounded-xl px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) =>
                    setItemForms((prev) => ({
                      ...prev,
                      [vendor.id]: {
                        ...form,
                        category: e.target.value as MealItemCategory,
                      },
                    }))
                  }
                >
                  {(vendor.category === "both" || vendor.category === "drink") && (
                    <option value="drink">飲料</option>
                  )}
                  {(vendor.category === "both" || vendor.category === "bento") && (
                    <option value="bento">便當</option>
                  )}
                </select>
                <input
                  className="border rounded-xl px-3 py-2 text-sm"
                  placeholder="參考價（可空）"
                  value={form.price}
                  onChange={(e) =>
                    setItemForms((prev) => ({
                      ...prev,
                      [vendor.id]: { ...form, price: e.target.value },
                    }))
                  }
                />
              </div>
              <button
                type="button"
                className="app-btn-outline text-sm"
                disabled={busy || !form.name.trim()}
                onClick={() => void addItem(vendor)}
              >
                新增品項
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

function TaxProfilesPanel({
  profiles,
  busy,
  setBusy,
  taxForm,
  setTaxForm,
  onChanged,
  siteId,
  userId,
}: {
  profiles: MealTaxProfile[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  taxForm: { companyName: string; taxId: string; note: string };
  setTaxForm: Dispatch<SetStateAction<{ companyName: string; taxId: string; note: string }>>;
  onChanged: () => Promise<void>;
  siteId: import("@/lib/sites").SiteId;
  userId: string;
}) {
  const addProfile = async () => {
    if (!taxForm.companyName.trim() || !taxForm.taxId.trim() || busy) return;
    if (!isPlausibleTaxId(taxForm.taxId)) {
      alert("統編請輸入 8 碼數字");
      return;
    }
    setBusy(true);
    try {
      await createTaxProfile({
        siteId,
        companyName: taxForm.companyName,
        taxId: taxForm.taxId,
        note: taxForm.note,
        createdBy: userId,
      });
      setTaxForm({ companyName: "", taxId: "", note: "" });
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增統編失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="app-section-title">新增廠商統編</h2>
        <p className="text-sm text-slate-600">
          依本店獨立管理。發布訂餐活動時可選用；刪除後不會影響已發布活動上的統編快照。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="抬頭／公司名稱"
            value={taxForm.companyName}
            onChange={(e) => setTaxForm({ ...taxForm, companyName: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="統一編號（8 碼）"
            inputMode="numeric"
            maxLength={8}
            value={taxForm.taxId}
            onChange={(e) => setTaxForm({ ...taxForm, taxId: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
            placeholder="備註（可空）"
            value={taxForm.note}
            onChange={(e) => setTaxForm({ ...taxForm, note: e.target.value })}
          />
        </div>
        <button
          type="button"
          className="app-btn-primary"
          disabled={busy || !taxForm.companyName.trim() || !taxForm.taxId.trim()}
          onClick={() => void addProfile()}
        >
          <Plus className="h-4 w-4 mr-1" />
          新增統編
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">尚未建立廠商統編</div>
      ) : (
        <div className="app-card divide-y divide-slate-100">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{p.companyName}</p>
                <p className="text-sm text-slate-600">統編 {p.taxId}</p>
                {p.note ? <p className="text-xs text-slate-400 mt-0.5">{p.note}</p> : null}
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-rose-600 inline-flex items-center gap-1 text-sm"
                title="刪除統編"
                onClick={async () => {
                  if (!window.confirm(`刪除「${p.companyName}」統編 ${p.taxId}？`)) return;
                  setBusy(true);
                  try {
                    await deactivateTaxProfile(p.id);
                    await onChanged();
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "刪除失敗");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                刪除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TodayPanel({
  openOrders,
  allOrders,
  lines,
  vendors,
  menuByVendor,
  vendorMap,
  taxProfiles,
  staff,
  currentUserId,
  currentUserName,
  siteId,
  focusOrderId,
  busy,
  setBusy,
  onChanged,
}: {
  openOrders: MealOrder[];
  allOrders: MealOrder[];
  lines: MealOrderLine[];
  vendors: MealVendor[];
  menuByVendor: Record<string, MealMenuItem[]>;
  vendorMap: Map<string, MealVendor>;
  taxProfiles: MealTaxProfile[];
  staff: Array<{ id: string; name: string }>;
  currentUserId: string;
  currentUserName: string;
  siteId: import("@/lib/sites").SiteId;
  focusOrderId: string | null;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [createForm, setCreateForm] = useState({
    orderCategory: "bento" as MealOrderCategory,
    vendorId: "",
    taxProfileId: "",
    orderDate: todayYmd(),
    title: "",
    budgetNote: "",
    note: "",
    publishBulletin: true,
  });

  const filteredVendors = useMemo(
    () =>
      vendors.filter((v) =>
        vendorMatchesOrderCategory(v.category, createForm.orderCategory)
      ),
    [vendors, createForm.orderCategory]
  );

  useEffect(() => {
    if (
      createForm.vendorId &&
      !filteredVendors.some((v) => v.id === createForm.vendorId)
    ) {
      setCreateForm((prev) => ({
        ...prev,
        vendorId: filteredVendors[0]?.id ?? "",
      }));
      return;
    }
    if (!createForm.vendorId && filteredVendors[0]?.id) {
      setCreateForm((prev) => ({ ...prev, vendorId: filteredVendors[0].id }));
    }
  }, [filteredVendors, createForm.vendorId]);

  const createActivity = async () => {
    const vendor = filteredVendors.find((v) => v.id === createForm.vendorId);
    if (!vendor || busy) return;
    if (!(menuByVendor[vendor.id]?.length > 0)) {
      alert("請先為該店家新增至少一個菜單品項");
      return;
    }
    const tax = taxProfiles.find((t) => t.id === createForm.taxProfileId) || null;
    setBusy(true);
    try {
      await createMealOrderActivity({
        siteId,
        vendorId: vendor.id,
        vendorName: vendor.name,
        title:
          createForm.title.trim() ||
          `${createForm.orderDate.replace(/-/g, "/")} ${ORDER_CATEGORY_LABELS[createForm.orderCategory]}｜${vendor.name}`,
        orderDate: createForm.orderDate,
        orderCategory: createForm.orderCategory,
        budgetNote: createForm.budgetNote,
        note: createForm.note,
        taxProfileId: tax?.id || null,
        taxCompanyName: tax?.companyName || "",
        taxId: tax?.taxId || "",
        createdBy: currentUserId,
        publishBulletin: createForm.publishBulletin,
      });
      setCreateForm((prev) => ({
        ...prev,
        title: "",
        budgetNote: "",
        note: "",
        taxProfileId: "",
      }));
      await onChanged();
      alert("訂餐活動已建立");
    } catch (err) {
      alert(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3 border-sky-200 bg-sky-50/50">
        <h2 className="app-section-title">發起訂餐活動（任何人）</h2>
        <p className="text-sm text-slate-600">
          一場活動一家店。請先選類別再選店家；同日要飲料又要便當可開兩場，或類別選「飲料＋便當」。
        </p>
        {vendors.length === 0 ? (
          <p className="text-sm text-amber-700">請先到「店家與菜單」新增店家。</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-slate-600">訂餐類別</span>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={createForm.orderCategory}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      orderCategory: e.target.value as MealOrderCategory,
                    })
                  }
                >
                  {(Object.keys(ORDER_CATEGORY_LABELS) as MealOrderCategory[]).map(
                    (key) => (
                      <option key={key} value={key}>
                        {ORDER_CATEGORY_LABELS[key]}
                      </option>
                    )
                  )}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">店家（依類別篩選）</span>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={createForm.vendorId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, vendorId: e.target.value })
                  }
                >
                  {filteredVendors.length === 0 ? (
                    <option value="">此類別尚無店家</option>
                  ) : (
                    filteredVendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}（{VENDOR_CATEGORY_LABELS[v.category]}）
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">訂餐日期</span>
                <input
                  type="date"
                  className="w-full border rounded-xl px-3 py-2"
                  value={createForm.orderDate}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, orderDate: e.target.value })
                  }
                />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-slate-600">廠商統編（選填）</span>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={createForm.taxProfileId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, taxProfileId: e.target.value })
                  }
                >
                  <option value="">不帶統編</option>
                  {taxProfiles.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.companyName}（{t.taxId}）
                    </option>
                  ))}
                </select>
              </label>
              {taxProfiles.length === 0 ? (
                <p className="text-xs text-slate-500 md:col-span-2">
                  尚無統編資料，可到「廠商統編」分頁新增後再選。
                </p>
              ) : null}
              <input
                className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
                placeholder="活動標題（可空，系統會自動帶）"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              />
              <input
                className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
                placeholder="金額上限說明（例：每人上限 80 元；僅告知，不強制卡關）"
                value={createForm.budgetNote}
                onChange={(e) =>
                  setCreateForm({ ...createForm, budgetNote: e.target.value })
                }
              />
              <input
                className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
                placeholder="備註（例：廠商中午上課）"
                value={createForm.note}
                onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={createForm.publishBulletin}
                onChange={(e) =>
                  setCreateForm({ ...createForm, publishBulletin: e.target.checked })
                }
              />
              同時發布訂餐公告（當天進站會提醒）
            </label>
            <button
              type="button"
              className="app-btn-primary"
              disabled={busy || !createForm.vendorId}
              onClick={() => void createActivity()}
            >
              發布訂餐活動
            </button>
          </>
        )}
      </div>

      {openOrders.length === 0 ? (
        <div className="app-card p-8 text-center text-slate-500">
          目前沒有進行中的訂餐活動
        </div>
      ) : (
        openOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            vendor={vendorMap.get(order.vendorId)}
            items={menuByVendor[order.vendorId] ?? []}
            lines={lines.filter((l) => l.orderId === order.id)}
            staff={staff}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            siteId={siteId}
            highlighted={focusOrderId === order.id}
            busy={busy}
            setBusy={setBusy}
            onChanged={onChanged}
          />
        ))
      )}

      {allOrders.some((o) => o.status === "open" && o.orderDate < todayYmd()) && (
        <p className="text-xs text-slate-500">
          提示：過期未結束的活動仍會列在歷史；請負責人盡快按「已訂購」收尾。
        </p>
      )}
    </div>
  );
}

function OrderCard({
  order,
  vendor,
  items,
  lines,
  staff,
  currentUserId,
  currentUserName,
  siteId,
  highlighted,
  busy,
  setBusy,
  onChanged,
}: {
  order: MealOrder;
  vendor?: MealVendor;
  items: MealMenuItem[];
  lines: MealOrderLine[];
  staff: Array<{ id: string; name: string }>;
  currentUserId: string;
  currentUserName: string;
  siteId: import("@/lib/sites").SiteId;
  highlighted?: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const [forUserId, setForUserId] = useState(currentUserId);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [sweetness, setSweetness] = useState<string>(DRINK_SWEETNESS_OPTIONS[2]);
  const [ice, setIce] = useState<string>(DRINK_ICE_OPTIONS[2]);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!itemId && items[0]?.id) setItemId(items[0].id);
  }, [items, itemId]);

  const selectedItem = items.find((i) => i.id === itemId) ?? null;
  const aggregates = aggregateOrderLines(lines);
  const canEdit = order.status === "open";

  const submitLine = async () => {
    if (!selectedItem || !canEdit || busy) return;
    const target =
      staff.find((s) => s.id === forUserId) ??
      ({ id: currentUserId, name: currentUserName } as const);
    if (selectedItem.category === "drink" && (!sweetness || !ice)) {
      alert("飲料請選擇甜度與冰塊");
      return;
    }
    setBusy(true);
    try {
      await addMealOrderLine({
        siteId,
        orderId: order.id,
        orderedBy: currentUserId,
        forUserId: target.id,
        forName: target.name,
        item: selectedItem,
        sweetness: selectedItem.category === "drink" ? sweetness : "",
        ice: selectedItem.category === "drink" ? ice : "",
        note: selectedItem.category === "bento" ? note : note,
      });
      setNote("");
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "加入失敗");
    } finally {
      setBusy(false);
    }
  };

  const markOrdered = async () => {
    if (!canEdit || busy) return;
    if (!window.confirm("確定標記為已訂購？活動將結束，公告會收起。")) return;
    setBusy(true);
    try {
      await markMealOrderOrdered({
        orderId: order.id,
        userId: currentUserId,
        bulletinId: order.bulletinId,
      });
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  const copySummary = async () => {
    const text = [
      `${order.title}`,
      `類別：${ORDER_CATEGORY_LABELS[order.orderCategory]}`,
      `店家：${vendor?.name ?? "—"} ${vendor?.phone ? `（${vendor.phone}）` : ""}`,
      order.taxCompanyName || order.taxId
        ? `統編／抬頭：${[order.taxCompanyName, order.taxId].filter(Boolean).join(" ")}`
        : "",
      order.budgetNote ? `金額上限：${order.budgetNote}` : "",
      "",
      ...aggregates.map(
        (a) => `${a.label} × ${a.count}（${a.names.join("、")}）`
      ),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      alert("已複製下單總表");
    } catch {
      alert(text);
    }
  };

  return (
    <div
      className={`app-card p-4 space-y-4 ${
        highlighted ? "ring-2 ring-sky-400 border-sky-300" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900">{order.title}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
              {ORDER_CATEGORY_LABELS[order.orderCategory]}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {order.orderDate.replace(/-/g, "/")} · {vendor?.name ?? "店家"}
            {vendor ? `（${VENDOR_CATEGORY_LABELS[vendor.category]}）` : ""}
          </p>
          {(order.taxCompanyName || order.taxId) && (
            <p className="text-sm text-slate-600 mt-1">
              統編／抬頭：{[order.taxCompanyName, order.taxId].filter(Boolean).join(" ")}
            </p>
          )}
          {order.budgetNote && (
            <p className="text-sm text-amber-800 mt-1">金額上限：{order.budgetNote}</p>
          )}
          {order.note && <p className="text-sm text-slate-500 mt-1">{order.note}</p>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => void markOrdered()}
            disabled={busy}
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
          >
            標記已訂購（結束）
          </button>
        )}
      </div>

      {canEdit && (
        <div className="rounded-xl border border-sky-100 bg-white p-3 space-y-3">
          <p className="text-sm font-medium text-slate-800">新增一杯／一份（可重複加入）</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="text-sm space-y-1">
              <span className="text-slate-600">給誰</span>
              <select
                className="w-full border rounded-xl px-3 py-2"
                value={forUserId}
                onChange={(e) => setForUserId(e.target.value)}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.id === currentUserId ? "（我）" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span className="text-slate-600">品項</span>
              <select
                className="w-full border rounded-xl px-3 py-2"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{ITEM_CATEGORY_LABELS[item.category]}] {item.name}
                    {item.price > 0 ? ` $${item.price}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {selectedItem?.category === "drink" && (
              <>
                <label className="text-sm space-y-1">
                  <span className="text-slate-600">甜度</span>
                  <select
                    className="w-full border rounded-xl px-3 py-2"
                    value={sweetness}
                    onChange={(e) => setSweetness(e.target.value)}
                  >
                    {DRINK_SWEETNESS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm space-y-1">
                  <span className="text-slate-600">冰塊</span>
                  <select
                    className="w-full border rounded-xl px-3 py-2"
                    value={ice}
                    onChange={(e) => setIce(e.target.value)}
                  >
                    {DRINK_ICE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <input
              className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
              placeholder={
                selectedItem?.category === "bento"
                  ? "備註（加飯／加蛋／不要香菜…）"
                  : "備註（可空）"
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="app-btn-primary"
            disabled={busy || !selectedItem}
            onClick={() => void submitLine()}
          >
            <Plus className="h-4 w-4 mr-1" />
            加入點選
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-800">點選明細</h4>
            <span className="text-xs text-slate-500">共 {lines.length} 份</span>
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {lines.length === 0 ? (
              <p className="text-sm text-slate-400">尚無人點選</p>
            ) : (
              lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-start justify-between gap-2 text-sm py-1.5 border-b border-slate-50 last:border-0"
                >
                  <div>
                    <span className="font-medium text-slate-800">{line.forName}</span>
                    <span className="text-slate-500"> · </span>
                    <span>
                      {line.category === "drink" ? (
                        <Coffee className="inline h-3.5 w-3.5 text-sky-600 mr-1" />
                      ) : (
                        <UtensilsCrossed className="inline h-3.5 w-3.5 text-amber-700 mr-1" />
                      )}
                      {line.itemName}
                      {line.category === "drink"
                        ? `（${[line.sweetness, line.ice].filter(Boolean).join("／")}）`
                        : ""}
                      {line.note ? `｜${line.note}` : ""}
                    </span>
                  </div>
                  {canEdit &&
                    (line.orderedBy === currentUserId ||
                      order.createdBy === currentUserId) && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-rose-600"
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await deleteMealOrderLine(line.id);
                            await onChanged();
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "刪除失敗");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-emerald-900">負責人下單總表</h4>
            <button
              type="button"
              onClick={() => void copySummary()}
              className="text-xs text-emerald-800 underline"
            >
              複製文字
            </button>
          </div>
          <div className="space-y-1 text-sm">
            {aggregates.length === 0 ? (
              <p className="text-slate-400">尚無資料</p>
            ) : (
              aggregates.map((a) => (
                <div key={a.key} className="text-slate-800">
                  <span className="font-medium">{a.label}</span>
                  <span className="text-emerald-800"> × {a.count}</span>
                  <div className="text-xs text-slate-500">{a.names.join("、")}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({
  orders,
  lines,
  vendorMap,
}: {
  orders: MealOrder[];
  lines: MealOrderLine[];
  vendorMap: Map<string, MealVendor>;
}) {
  if (orders.length === 0) {
    return <div className="app-card p-8 text-center text-slate-500">尚無歷史訂單</div>;
  }
  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const orderLines = lines.filter((l) => l.orderId === order.id);
        const aggregates = aggregateOrderLines(orderLines);
        const vendor = vendorMap.get(order.vendorId);
        return (
          <div key={order.id} className="app-card p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-semibold text-slate-900">{order.title}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                {ORDER_CATEGORY_LABELS[order.orderCategory]}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-2">
              {order.orderDate.replace(/-/g, "/")} · {vendor?.name ?? "店家"} · 共{" "}
              {orderLines.length} 份
              {order.taxCompanyName || order.taxId
                ? ` · 統編 ${[order.taxCompanyName, order.taxId].filter(Boolean).join(" ")}`
                : ""}
            </p>
            <div className="text-sm text-slate-700 space-y-1">
              {aggregates.map((a) => (
                <div key={a.key}>
                  {a.label} × {a.count}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
