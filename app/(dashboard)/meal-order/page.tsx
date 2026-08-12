"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Coffee, Plus, Store, Trash2, UtensilsCrossed } from "lucide-react";
import { useApp } from "@/lib/context/AppContext";
import { HelpTip } from "@/components/ui/HelpTip";
import {
  addMealOrderLine,
  createMealOrderActivity,
  createMealVendor,
  createMenuItem,
  deactivateMenuItem,
  deleteMealOrderLine,
  loadMealOrders,
  loadMealVendors,
  loadMenuItems,
  loadOrderLines,
  markMealOrderOrdered,
} from "@/lib/meal-order/api";
import {
  aggregateOrderLines,
  DRINK_ICE_OPTIONS,
  DRINK_SWEETNESS_OPTIONS,
  ITEM_CATEGORY_LABELS,
  ORDER_STATUS_LABELS,
  todayYmd,
  VENDOR_CATEGORY_LABELS,
  type MealItemCategory,
  type MealMenuItem,
  type MealOrder,
  type MealOrderLine,
  type MealVendor,
  type MealVendorCategory,
} from "@/lib/meal-order/types";

type TabKey = "today" | "vendors" | "history";

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

  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [vendorList, orderList] = await Promise.all([
        loadMealVendors(activeSiteId),
        loadMealOrders(activeSiteId),
      ]);
      setVendors(vendorList);
      setOrders(orderList);
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
      setLoading(false);
    }
  }, [activeSiteId, currentUser]);

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
        <p>2. 任何人可發起訂餐活動（選日期、店家、金額上限說明），並發公告提醒。</p>
        <p>3. 同日若要又訂飲料又訂便當：請開兩場活動（各選一家店）。</p>
        <p>4. 大家可自點或多點，也可幫同事代點；負責人看總表下單後按「已訂購」結束，公告會自動收起。</p>
      </HelpTip>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["today", "今日／進行中"],
            ["vendors", "店家與菜單"],
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
          onChanged={refresh}
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
          staff={staff}
          currentUserId={currentUser.id}
          currentUserName={currentUser.name}
          siteId={activeSiteId}
          focusOrderId={focusOrderId}
          busy={busy}
          setBusy={setBusy}
          onChanged={async () => {
            await refresh();
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
  onChanged,
  siteId,
  userId,
}: {
  vendors: MealVendor[];
  menuByVendor: Record<string, MealMenuItem[]>;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChanged: () => Promise<void>;
  siteId: import("@/lib/sites").SiteId;
  userId: string;
}) {
  const [vendorForm, setVendorForm] = useState({
    name: "",
    category: "drink" as MealVendorCategory,
    phone: "",
    address: "",
    menuUrl: "",
    note: "",
  });
  const [itemForms, setItemForms] = useState<
    Record<string, { name: string; category: MealItemCategory; price: string }>
  >({});

  const addVendor = async () => {
    if (!vendorForm.name.trim() || busy) return;
    setBusy(true);
    try {
      await createMealVendor({
        siteId,
        createdBy: userId,
        ...vendorForm,
      });
      setVendorForm({
        name: "",
        category: "drink",
        phone: "",
        address: "",
        menuUrl: "",
        note: "",
      });
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

function TodayPanel({
  openOrders,
  allOrders,
  lines,
  vendors,
  menuByVendor,
  vendorMap,
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
    vendorId: vendors[0]?.id ?? "",
    orderDate: todayYmd(),
    title: "",
    budgetNote: "",
    note: "",
    publishBulletin: true,
  });

  useEffect(() => {
    if (!createForm.vendorId && vendors[0]?.id) {
      setCreateForm((prev) => ({ ...prev, vendorId: vendors[0].id }));
    }
  }, [vendors, createForm.vendorId]);

  const createActivity = async () => {
    const vendor = vendors.find((v) => v.id === createForm.vendorId);
    if (!vendor || busy) return;
    if (!(menuByVendor[vendor.id]?.length > 0)) {
      alert("請先為該店家新增至少一個菜單品項");
      return;
    }
    setBusy(true);
    try {
      await createMealOrderActivity({
        siteId,
        vendorId: vendor.id,
        vendorName: vendor.name,
        title:
          createForm.title.trim() ||
          `${createForm.orderDate.replace(/-/g, "/")} 訂餐｜${vendor.name}`,
        orderDate: createForm.orderDate,
        budgetNote: createForm.budgetNote,
        note: createForm.note,
        createdBy: currentUserId,
        publishBulletin: createForm.publishBulletin,
      });
      setCreateForm((prev) => ({
        ...prev,
        title: "",
        budgetNote: "",
        note: "",
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
          一場活動一家店。若同日要飲料又要便當，請再發起第二場。
        </p>
        {vendors.length === 0 ? (
          <p className="text-sm text-amber-700">請先到「店家與菜單」新增店家。</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-slate-600">店家</span>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={createForm.vendorId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, vendorId: e.target.value })
                  }
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}（{VENDOR_CATEGORY_LABELS[v.category]}）
                    </option>
                  ))}
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
      `店家：${vendor?.name ?? "—"} ${vendor?.phone ? `（${vendor.phone}）` : ""}`,
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
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {order.orderDate.replace(/-/g, "/")} · {vendor?.name ?? "店家"}
            {vendor ? `（${VENDOR_CATEGORY_LABELS[vendor.category]}）` : ""}
          </p>
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
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-2">
              {order.orderDate.replace(/-/g, "/")} · {vendor?.name ?? "店家"} · 共{" "}
              {orderLines.length} 份
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
