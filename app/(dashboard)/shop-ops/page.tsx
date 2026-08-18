"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, FileDown, ListChecks, Package, Pill, Plus, Printer, ShoppingBag, Trash2 } from "lucide-react";
import { useApp } from "@/lib/context/AppContext";
import { HelpTip } from "@/components/ui/HelpTip";
import { canManageSite } from "@/lib/auth/roles";
import {
  closeShopRecords,
  createCustomerOrder,
  createMedicineRequest,
  createProcurementCategory,
  createProcurementItem,
  deactivateProcurementCategory,
  deletePendingShopRecord,
  ensureDefaultProcurementCategories,
  loadCustomerOrders,
  loadMedicineRequests,
  loadProcurementItems,
  updateCustomerFulfillment,
  updateCustomerPayment,
} from "@/lib/shop-ops/api";
import { exportCustomerOrdersExcel, printCustomerOrdersForm } from "@/lib/shop-ops/exportCustomerOrders";
import {
  CUSTOMER_PAYMENT_LABELS,
  FULFILLMENT_FILTER_LABELS,
  formatMedicineQty,
  formatMoney,
  matchesFulfillmentFilter,
  MEDICINE_KIND_LABELS,
  MEDICINE_QTY_MODE_LABELS,
  SHOP_STATUS_LABELS,
  type CustomerOrder,
  type CustomerPaymentStatus,
  type FulfillmentFilter,
  type MedicineKind,
  type MedicineQtyMode,
  type MedicineRequest,
  type ProcurementCategory,
  type ProcurementItem,
  type ShopRecordStatus,
} from "@/lib/shop-ops/types";

type TabKey = "procurement" | "medicine" | "customer" | "fulfillment";
type ListFilter = "pending" | "closed";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}/${m}/${day} ${hh}:${mm}`;
}

export default function ShopOpsPage() {
  const { currentUser, employees, activeSiteId, storeConfig } = useApp();
  const [tab, setTab] = useState<TabKey>("procurement");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<ProcurementCategory[]>([]);
  const [procurement, setProcurement] = useState<ProcurementItem[]>([]);
  const [medicine, setMedicine] = useState<MedicineRequest[]>([]);
  const [customers, setCustomers] = useState<CustomerOrder[]>([]);

  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e) => map.set(e.id, e.name));
    if (currentUser) map.set(currentUser.id, currentUser.name);
    return map;
  }, [employees, currentUser]);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!currentUser) return;
      if (!opts?.silent) setLoading(true);
      try {
        const [cats, proc, med, cust] = await Promise.all([
          ensureDefaultProcurementCategories({
            siteId: activeSiteId,
            userId: currentUser.id,
          }),
          loadProcurementItems(activeSiteId),
          loadMedicineRequests(activeSiteId),
          loadCustomerOrders(activeSiteId),
        ]);
        setCategories(cats);
        setProcurement(proc);
        setMedicine(med);
        setCustomers(cust);
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "載入失敗（請確認已套用資料庫 migration）");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [activeSiteId, currentUser]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!currentUser) return null;
  const isManager = canManageSite(currentUser.role);

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <div>
          <h1 className="app-page-title flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-sky-700" />
            店務需求
          </h1>
          <p className="app-meta mt-1">
            日常採購、叫藥、客人訂購、客訂管理。員工先登記，之後統一處理；客訂可追蹤到貨／通知／已拿並列印。
          </p>
        </div>
      </div>

      <HelpTip
        title="怎麼用"
        hint="先寫下來 → 有人處理 → 結單（紀錄仍在）"
        defaultOpen
        storageKey={`help:shop-ops:${storageScope}`}
      >
        <p>1. <strong>日常採購</strong>：文具、影印紙、貼紙等。類別可自己新增／刪除。</p>
        <p>
          2. <strong>叫藥需求</strong>：包藥或缺貨時登記。預包／欠藥可直接填數量，或勾第二次（IC02）／第三次（IC03）；低於庫存填現存數量。健保碼、單位選填。
        </p>
        <p>
          3. <strong>客人訂購</strong>：姓名、電話、商品、數量、單位、金額、已付款／未付款。健保碼選填。接手人＝新增這筆的人。
        </p>
        <p>
          4. <strong>客訂管理</strong>：標記貨到了／已通知／已拿，可篩選、匯出 Excel、列印紙本勾選表。
        </p>
        <p>5. 處理完按「結單」。待處理可刪；已結單只留紀錄、不刪。</p>
      </HelpTip>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["procurement", "日常採購", ShoppingBag],
            ["medicine", "叫藥需求", Pill],
            ["customer", "客人訂購", Package],
            ["fulfillment", "客訂管理", ListChecks],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold border inline-flex items-center gap-2 ${
              tab === key
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-sky-50"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="app-card p-8 text-center text-slate-500">載入中...</div>
      ) : tab === "procurement" ? (
        <ProcurementPanel
          categories={categories}
          items={procurement}
          busy={busy}
          setBusy={setBusy}
          nameById={nameById}
          siteId={activeSiteId}
          userId={currentUser.id}
          isManager={isManager}
          onChanged={() => refresh({ silent: true })}
        />
      ) : tab === "medicine" ? (
        <MedicinePanel
          items={medicine}
          busy={busy}
          setBusy={setBusy}
          nameById={nameById}
          siteId={activeSiteId}
          userId={currentUser.id}
          isManager={isManager}
          onChanged={() => refresh({ silent: true })}
        />
      ) : tab === "customer" ? (
        <CustomerPanel
          items={customers}
          busy={busy}
          setBusy={setBusy}
          nameById={nameById}
          siteId={activeSiteId}
          userId={currentUser.id}
          userName={currentUser.name}
          isManager={isManager}
          onChanged={() => refresh({ silent: true })}
        />
      ) : (
        <FulfillmentPanel
          items={customers}
          busy={busy}
          setBusy={setBusy}
          nameById={nameById}
          storeName={storeConfig.storeName || "藥局"}
          userId={currentUser.id}
          isManager={isManager}
          onChanged={() => refresh({ silent: true })}
        />
      )}
    </div>
  );
}

function FilterToggle({
  value,
  onChange,
  pendingCount,
  closedCount,
}: {
  value: ListFilter;
  onChange: (v: ListFilter) => void;
  pendingCount: number;
  closedCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`px-3 py-1.5 rounded-lg text-sm border ${
          value === "pending" ? "bg-amber-500 text-white border-amber-500" : "bg-white border-slate-200"
        }`}
        onClick={() => onChange("pending")}
      >
        待處理（{pendingCount}）
      </button>
      <button
        type="button"
        className={`px-3 py-1.5 rounded-lg text-sm border ${
          value === "closed" ? "bg-slate-700 text-white border-slate-700" : "bg-white border-slate-200"
        }`}
        onClick={() => onChange("closed")}
      >
        已結單（{closedCount}）
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: ShopRecordStatus }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${
        status === "pending" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {SHOP_STATUS_LABELS[status]}
    </span>
  );
}

function ProcurementPanel({
  categories,
  items,
  busy,
  setBusy,
  nameById,
  siteId,
  userId,
  isManager,
  onChanged,
}: {
  categories: ProcurementCategory[];
  items: ProcurementItem[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  nameById: Map<string, string>;
  siteId: import("@/lib/sites").SiteId;
  userId: string;
  isManager: boolean;
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<ListFilter>("pending");
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({
    categoryId: categories[0]?.id ?? "",
    itemName: "",
    quantity: "1",
    unit: "",
    note: "",
  });
  const [newCat, setNewCat] = useState("");

  useEffect(() => {
    if (!form.categoryId && categories[0]?.id) {
      setForm((p) => ({ ...p, categoryId: categories[0].id }));
    }
  }, [categories, form.categoryId]);

  const visible = items.filter((i) => i.status === filter);

  const addCategory = async () => {
    if (!newCat.trim() || busy) return;
    setBusy(true);
    try {
      const created = await createProcurementCategory({
        siteId,
        name: newCat,
        createdBy: userId,
      });
      setNewCat("");
      setForm((p) => ({ ...p, categoryId: created.id }));
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增類別失敗");
    } finally {
      setBusy(false);
    }
  };

  const addItem = async () => {
    const cat = categories.find((c) => c.id === form.categoryId);
    if (!cat || busy) return;
    setBusy(true);
    try {
      await createProcurementItem({
        siteId,
        categoryId: cat.id,
        categoryName: cat.name,
        itemName: form.itemName,
        quantity: form.quantity,
        unit: form.unit,
        note: form.note,
        createdBy: userId,
      });
      setForm((p) => ({ ...p, itemName: "", quantity: "1", note: "" }));
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setBusy(false);
    }
  };

  const closeIds = async (ids: string[]) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await closeShopRecords({
        table: "shop_procurement_items",
        ids,
        closedBy: userId,
      });
      setSelected([]);
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "結單失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="app-section-title">登記日常採購</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <span className="text-slate-600">類別</span>
            <select
              className="w-full border rounded-xl px-3 py-2"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              {categories.length === 0 ? (
                <option value="">請先新增類別</option>
              ) : (
                categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <input
              className="flex-1 border rounded-xl px-3 py-2 text-sm"
              placeholder="新增類別（例：膠帶）"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
            <button type="button" className="app-btn-outline shrink-0" disabled={busy} onClick={() => void addCategory()}>
              新增類別
            </button>
          </div>
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="品名（例：A4 影印紙）"
            value={form.itemName}
            onChange={(e) => setForm({ ...form, itemName: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded-xl px-3 py-2 text-sm"
              placeholder="數量"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <input
              className="border rounded-xl px-3 py-2 text-sm"
              placeholder="單位（包／盒／個）"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </div>
          <input
            className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
            placeholder="備註（可空）"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <button type="button" className="app-btn-primary" disabled={busy} onClick={() => void addItem()}>
          <Plus className="h-4 w-4 mr-1" />
          寫入待處理
        </button>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {categories.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 text-xs bg-slate-100 rounded-full px-2 py-1"
              >
                {c.name}
                <button
                  type="button"
                  className="text-slate-400 hover:text-rose-600"
                  title="刪除類別"
                  onClick={async () => {
                    if (!window.confirm(`刪除類別「${c.name}」？已寫過的紀錄仍會保留類別名稱。`)) return;
                    setBusy(true);
                    try {
                      await deactivateProcurementCategory(c.id);
                      await onChanged();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "刪除失敗");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <FilterToggle
        value={filter}
        onChange={setFilter}
        pendingCount={items.filter((i) => i.status === "pending").length}
        closedCount={items.filter((i) => i.status === "closed").length}
      />

      {filter === "pending" && visible.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || selected.length === 0}
            onClick={() => void closeIds(selected)}
          >
            結所選（{selected.length}）
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy}
            onClick={() => void closeIds(visible.map((i) => i.id))}
          >
            全部結單
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">沒有{filter === "pending" ? "待處理" : "已結單"}紀錄</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="app-card p-3 flex flex-wrap items-start gap-3">
              {filter === "pending" && (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.includes(row.id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                    )
                  }
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">{row.categoryName}</span>
                  <span className="font-semibold text-slate-900">{row.itemName}</span>
                  <span className="text-slate-700">
                    × {row.quantity}
                    {row.unit ? ` ${row.unit}` : ""}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {nameById.get(row.createdBy) ?? "員工"} · {formatWhen(row.createdAt)}
                  {row.closedAt
                    ? ` · 結單 ${nameById.get(row.closedBy ?? "") ?? ""} ${formatWhen(row.closedAt)}`
                    : ""}
                </p>
                {row.note && <p className="text-sm text-slate-600 mt-1">{row.note}</p>}
              </div>
              {row.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-sm text-emerald-700 font-medium"
                    onClick={() => void closeIds([row.id])}
                  >
                    結單
                  </button>
                  {(row.createdBy === userId || isManager) && (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={async () => {
                        if (!window.confirm("刪除這筆待處理？")) return;
                        setBusy(true);
                        try {
                          await deletePendingShopRecord({
                            table: "shop_procurement_items",
                            id: row.id,
                          });
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MedicinePanel({
  items,
  busy,
  setBusy,
  nameById,
  siteId,
  userId,
  isManager,
  onChanged,
}: {
  items: MedicineRequest[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  nameById: Map<string, string>;
  siteId: import("@/lib/sites").SiteId;
  userId: string;
  isManager: boolean;
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<ListFilter>("pending");
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({
    kind: "shortage" as MedicineKind,
    itemName: "",
    nhiCode: "",
    qtyMode: "direct" as MedicineQtyMode,
    quantity: "",
    unit: "",
    useIc02: false,
    ic02Qty: "",
    useIc03: false,
    ic03Qty: "",
    currentStock: "",
    note: "",
  });

  const visible = items.filter((i) => i.status === filter);
  const needsQty = form.kind !== "below_stock";

  const addItem = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createMedicineRequest({
        siteId,
        createdBy: userId,
        ...form,
      });
      setForm((p) => ({
        ...p,
        itemName: "",
        nhiCode: "",
        quantity: "",
        unit: "",
        ic02Qty: "",
        ic03Qty: "",
        currentStock: "",
        note: "",
      }));
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setBusy(false);
    }
  };

  const closeIds = async (ids: string[]) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await closeShopRecords({
        table: "shop_medicine_requests",
        ids,
        closedBy: userId,
      });
      setSelected([]);
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "結單失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="app-section-title">登記叫藥需求</h2>
        <p className="text-sm text-slate-600">
          預包、欠藥可直接填數量，或改用第二次／第三次領藥（IC02／IC03，可只勾其中一個）。低於庫存請填現存多少。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            <span className="text-slate-600">類型</span>
            <select
              className="w-full border rounded-xl px-3 py-2"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as MedicineKind })}
            >
              {(Object.keys(MEDICINE_KIND_LABELS) as MedicineKind[]).map((k) => (
                <option key={k} value={k}>
                  {MEDICINE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="藥名／品名"
            value={form.itemName}
            onChange={(e) => setForm({ ...form, itemName: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="健保碼（選填）"
            value={form.nhiCode}
            onChange={(e) => setForm({ ...form, nhiCode: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="單位（選填，如盒／瓶／顆）"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
          {form.kind === "below_stock" ? (
            <label className="text-sm space-y-1 md:col-span-2">
              <span className="text-slate-600">現存數量</span>
              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="目前還剩多少"
                inputMode="decimal"
                value={form.currentStock}
                onChange={(e) => setForm({ ...form, currentStock: e.target.value })}
              />
            </label>
          ) : (
            <>
              <label className="text-sm space-y-1 md:col-span-2">
                <span className="text-slate-600">數量怎麼填</span>
                <select
                  className="w-full border rounded-xl px-3 py-2"
                  value={form.qtyMode}
                  onChange={(e) => setForm({ ...form, qtyMode: e.target.value as MedicineQtyMode })}
                >
                  {(Object.keys(MEDICINE_QTY_MODE_LABELS) as MedicineQtyMode[]).map((k) => (
                    <option key={k} value={k}>
                      {MEDICINE_QTY_MODE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              {form.qtyMode === "direct" ? (
                <input
                  className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
                  placeholder="數量"
                  inputMode="decimal"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              ) : (
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start gap-2 border rounded-xl px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.useIc02}
                      onChange={(e) => setForm({ ...form, useIc02: e.target.checked })}
                    />
                    <span className="flex-1 text-sm">
                      <span className="font-medium">IC02 第二次</span>
                      <input
                        className="mt-1 w-full border rounded-lg px-2 py-1"
                        placeholder="數量"
                        inputMode="decimal"
                        disabled={!form.useIc02}
                        value={form.ic02Qty}
                        onChange={(e) => setForm({ ...form, ic02Qty: e.target.value })}
                      />
                    </span>
                  </label>
                  <label className="flex items-start gap-2 border rounded-xl px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.useIc03}
                      onChange={(e) => setForm({ ...form, useIc03: e.target.checked })}
                    />
                    <span className="flex-1 text-sm">
                      <span className="font-medium">IC03 第三次</span>
                      <input
                        className="mt-1 w-full border rounded-lg px-2 py-1"
                        placeholder="數量"
                        inputMode="decimal"
                        disabled={!form.useIc03}
                        value={form.ic03Qty}
                        onChange={(e) => setForm({ ...form, ic03Qty: e.target.value })}
                      />
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
          <input
            className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
            placeholder="備註（可空）"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <button type="button" className="app-btn-primary" disabled={busy} onClick={() => void addItem()}>
          <Plus className="h-4 w-4 mr-1" />
          寫入待處理
        </button>
        {!needsQty && <p className="text-xs text-slate-500">低於庫存不必填叫貨數量，先登記現存即可。</p>}
      </div>

      <FilterToggle
        value={filter}
        onChange={setFilter}
        pendingCount={items.filter((i) => i.status === "pending").length}
        closedCount={items.filter((i) => i.status === "closed").length}
      />

      {filter === "pending" && visible.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || selected.length === 0}
            onClick={() => void closeIds(selected)}
          >
            結所選（{selected.length}）
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy}
            onClick={() => void closeIds(visible.map((i) => i.id))}
          >
            全部結單
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">沒有{filter === "pending" ? "待處理" : "已結單"}紀錄</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="app-card p-3 flex flex-wrap items-start gap-3">
              {filter === "pending" && (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.includes(row.id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                    )
                  }
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
                    {MEDICINE_KIND_LABELS[row.kind]}
                  </span>
                  <span className="font-semibold text-slate-900">{row.itemName}</span>
                  {row.nhiCode ? (
                    <span className="text-xs text-slate-500">健保碼 {row.nhiCode}</span>
                  ) : null}
                  <span className="text-slate-700">{formatMedicineQty(row)}</span>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {nameById.get(row.createdBy) ?? "員工"} · {formatWhen(row.createdAt)}
                  {row.closedAt
                    ? ` · 結單 ${nameById.get(row.closedBy ?? "") ?? ""} ${formatWhen(row.closedAt)}`
                    : ""}
                </p>
                {row.note && <p className="text-sm text-slate-600 mt-1">{row.note}</p>}
              </div>
              {row.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-sm text-emerald-700 font-medium"
                    onClick={() => void closeIds([row.id])}
                  >
                    結單
                  </button>
                  {(row.createdBy === userId || isManager) && (
                    <button
                      type="button"
                      className="text-slate-400 hover:text-rose-600"
                      onClick={async () => {
                        if (!window.confirm("刪除這筆待處理？")) return;
                        setBusy(true);
                        try {
                          await deletePendingShopRecord({
                            table: "shop_medicine_requests",
                            id: row.id,
                          });
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerPanel({
  items,
  busy,
  setBusy,
  nameById,
  siteId,
  userId,
  userName,
  isManager,
  onChanged,
}: {
  items: CustomerOrder[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  nameById: Map<string, string>;
  siteId: import("@/lib/sites").SiteId;
  userId: string;
  userName: string;
  isManager: boolean;
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<ListFilter>("pending");
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    productName: "",
    nhiCode: "",
    quantity: "1",
    unit: "",
    amount: "",
    paymentStatus: "unpaid" as CustomerPaymentStatus,
    note: "",
  });

  const visible = items.filter((i) => i.status === filter);

  const addItem = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createCustomerOrder({
        siteId,
        handlerId: userId,
        ...form,
      });
      setForm({
        customerName: "",
        customerPhone: "",
        productName: "",
        nhiCode: "",
        quantity: "1",
        unit: "",
        amount: "",
        paymentStatus: "unpaid",
        note: "",
      });
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setBusy(false);
    }
  };

  const closeIds = async (ids: string[]) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await closeShopRecords({
        table: "shop_customer_orders",
        ids,
        closedBy: userId,
      });
      setSelected([]);
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "結單失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="app-section-title">登記客人訂購</h2>
        <p className="text-sm text-slate-600">
          接手人：<strong>{userName}</strong>（由誰新增就記誰）
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="客人姓名"
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="電話"
            value={form.customerPhone}
            onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="商品"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="健保碼（選填）"
            value={form.nhiCode}
            onChange={(e) => setForm({ ...form, nhiCode: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border rounded-xl px-3 py-2 text-sm"
              placeholder="數量"
              inputMode="decimal"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
            <input
              className="border rounded-xl px-3 py-2 text-sm"
              placeholder="單位（選填）"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </div>
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="金額"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <label className="text-sm space-y-1">
            <span className="text-slate-600">付款</span>
            <select
              className="w-full border rounded-xl px-3 py-2"
              value={form.paymentStatus}
              onChange={(e) =>
                setForm({ ...form, paymentStatus: e.target.value as CustomerPaymentStatus })
              }
            >
              <option value="unpaid">{CUSTOMER_PAYMENT_LABELS.unpaid}</option>
              <option value="paid">{CUSTOMER_PAYMENT_LABELS.paid}</option>
            </select>
          </label>
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="備註（可空）"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <button type="button" className="app-btn-primary" disabled={busy} onClick={() => void addItem()}>
          <Plus className="h-4 w-4 mr-1" />
          寫入待處理
        </button>
      </div>

      <FilterToggle
        value={filter}
        onChange={setFilter}
        pendingCount={items.filter((i) => i.status === "pending").length}
        closedCount={items.filter((i) => i.status === "closed").length}
      />

      {filter === "pending" && visible.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || selected.length === 0}
            onClick={() => void closeIds(selected)}
          >
            結所選（{selected.length}）
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy}
            onClick={() => void closeIds(visible.map((i) => i.id))}
          >
            全部結單
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">沒有{filter === "pending" ? "待處理" : "已結單"}紀錄</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="app-card p-3 flex flex-wrap items-start gap-3">
              {filter === "pending" && (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.includes(row.id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                    )
                  }
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{row.customerName}</span>
                  <span className="text-slate-600">{row.customerPhone}</span>
                  <StatusBadge status={row.status} />
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      row.paymentStatus === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {CUSTOMER_PAYMENT_LABELS[row.paymentStatus]}
                  </span>
                </div>
                <p className="text-sm text-slate-800 mt-1">
                  {row.productName}
                  {row.nhiCode ? `（健保碼 ${row.nhiCode}）` : ""} × {row.quantity}
                  {row.unit ? ` ${row.unit}` : ""} · {formatMoney(row.amount)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  接手 {nameById.get(row.handlerId) ?? "員工"} · {formatWhen(row.createdAt)}
                  {row.closedAt
                    ? ` · 結單 ${nameById.get(row.closedBy ?? "") ?? ""} ${formatWhen(row.closedAt)}`
                    : ""}
                </p>
                {row.note && <p className="text-sm text-slate-600 mt-1">{row.note}</p>}
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  className="text-xs underline text-slate-600"
                  onClick={async () => {
                    const next = row.paymentStatus === "paid" ? "unpaid" : "paid";
                    setBusy(true);
                    try {
                      await updateCustomerPayment({ id: row.id, paymentStatus: next });
                      await onChanged();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "更新失敗");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  改為{row.paymentStatus === "paid" ? "未付款" : "已付款"}
                </button>
                {row.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-sm text-emerald-700 font-medium"
                      onClick={() => void closeIds([row.id])}
                    >
                      結單
                    </button>
                    {(row.createdBy === userId || isManager) && (
                      <button
                        type="button"
                        className="text-slate-400 hover:text-rose-600"
                        onClick={async () => {
                          if (!window.confirm("刪除這筆待處理？")) return;
                          setBusy(true);
                          try {
                            await deletePendingShopRecord({
                              table: "shop_customer_orders",
                              id: row.id,
                            });
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
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleChip({
  on,
  onLabel,
  offLabel,
  disabled,
  onClick,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
        on
          ? "bg-emerald-600 text-white border-emerald-600"
          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

function FulfillmentPanel({
  items,
  busy,
  setBusy,
  nameById,
  storeName,
  userId,
  isManager,
  onChanged,
}: {
  items: CustomerOrder[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  nameById: Map<string, string>;
  storeName: string;
  userId: string;
  isManager: boolean;
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<FulfillmentFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const handlerName = (id: string) => nameById.get(id) ?? "員工";
  const visible = items.filter((row) => matchesFulfillmentFilter(row, filter));

  const patch = async (
    ids: string[],
    fields: { goodsArrived?: boolean; notified?: boolean; pickedUp?: boolean }
  ) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await updateCustomerFulfillment({ ids, ...fields });
      setSelected([]);
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="app-section-title">客訂管理</h2>
        <p className="text-sm text-slate-600">
          追蹤貨有沒有來、有沒有通知客人、客人有沒有拿走。可匯出 Excel 或列印成紙本勾選。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-btn-outline inline-flex items-center gap-1"
            disabled={visible.length === 0}
            onClick={() =>
              exportCustomerOrdersExcel({
                storeName,
                rows: visible,
                handlerName,
              })
            }
          >
            <FileDown className="h-4 w-4" />
            匯出表單
          </button>
          <button
            type="button"
            className="app-btn-outline inline-flex items-center gap-1"
            disabled={visible.length === 0}
            onClick={() =>
              printCustomerOrdersForm({
                storeName,
                rows: visible,
                handlerName,
              })
            }
          >
            <Printer className="h-4 w-4" />
            列印紙本
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(FULFILLMENT_FILTER_LABELS) as FulfillmentFilter[]).map((key) => {
          const count = items.filter((row) => matchesFulfillmentFilter(row, key)).length;
          return (
            <button
              key={key}
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                filter === key ? "bg-sky-600 text-white border-sky-600" : "bg-white border-slate-200"
              }`}
              onClick={() => {
                setFilter(key);
                setSelected([]);
              }}
            >
              {FULFILLMENT_FILTER_LABELS[key]}（{count}）
            </button>
          );
        })}
      </div>

      {visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || selected.length === 0}
            onClick={() => void patch(selected, { goodsArrived: true })}
          >
            所選標記已到貨
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patch(selected, { notified: true })}
          >
            所選標記已通知
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patch(selected, { pickedUp: true })}
          >
            所選標記已拿
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">這個篩選沒有客訂</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="app-card p-3 flex flex-wrap items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(row.id)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                  )
                }
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{row.customerName}</span>
                  <span className="text-slate-600">{row.customerPhone}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      row.paymentStatus === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    {CUSTOMER_PAYMENT_LABELS[row.paymentStatus]}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-sm text-slate-800 mt-1">
                  {row.productName}
                  {row.nhiCode ? `（健保碼 ${row.nhiCode}）` : ""} × {row.quantity}
                  {row.unit ? ` ${row.unit}` : ""} · {formatMoney(row.amount)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  接手 {handlerName(row.handlerId)} · {formatWhen(row.createdAt)}
                </p>
                {row.note && <p className="text-sm text-slate-600 mt-1">{row.note}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  <ToggleChip
                    on={row.goodsArrived}
                    onLabel="已到貨"
                    offLabel="未到貨"
                    disabled={busy}
                    onClick={() => void patch([row.id], { goodsArrived: !row.goodsArrived })}
                  />
                  <ToggleChip
                    on={row.notified}
                    onLabel="已通知"
                    offLabel="未通知"
                    disabled={busy}
                    onClick={() => void patch([row.id], { notified: !row.notified })}
                  />
                  <ToggleChip
                    on={row.pickedUp}
                    onLabel="已拿"
                    offLabel="未拿"
                    disabled={busy}
                    onClick={() => void patch([row.id], { pickedUp: !row.pickedUp })}
                  />
                </div>
              </div>
              {row.status === "pending" && (row.createdBy === userId || isManager) && (
                <button
                  type="button"
                  className="text-slate-400 hover:text-rose-600"
                  onClick={async () => {
                    if (!window.confirm("刪除這筆待處理？")) return;
                    setBusy(true);
                    try {
                      await deletePendingShopRecord({
                        table: "shop_customer_orders",
                        id: row.id,
                      });
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
          ))}
        </div>
      )}
    </div>
  );
}
