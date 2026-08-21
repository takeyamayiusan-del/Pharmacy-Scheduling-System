"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, FileDown, ListChecks, Package, Pencil, Pill, Plus, Printer, ShoppingBag, Trash2, X } from "lucide-react";
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
  deleteShopRecords,
  ensureDefaultProcurementCategories,
  loadCustomerOrders,
  loadMedicineRequests,
  loadProcurementItems,
  reopenShopRecords,
  updateCustomerFulfillment,
  updateCustomerOrder,
  updateCustomerPayment,
  updateMedicineFulfillment,
  updateMedicineRequest,
  updateProcurementItem,
} from "@/lib/shop-ops/api";
import { exportCustomerOrdersExcel, exportCustomerOrdersPdf } from "@/lib/shop-ops/exportCustomerOrders";
import {
  canDeleteShopRecord,
  CUSTOMER_PAYMENT_LABELS,
  CUSTOMER_URGENCY_LABELS,
  FULFILLMENT_FILTER_LABELS,
  DATE_PRESET_LABELS,
  datePresetRange,
  formatCreatedStamp,
  formatMedicineQty,
  formatMoney,
  formatWantedArriveDate,
  isCustomerFulfillmentComplete,
  matchesCreatedDate,
  matchesFulfillmentFilter,
  MEDICINE_KIND_LABELS,
  MEDICINE_QTY_MODE_LABELS,
  SHOP_OPS_TAB_KEYS,
  SHOP_STATUS_LABELS,
  sortByCreatedAtAsc,
  sortCustomerOrders,
  type CustomerOrder,
  type CustomerPaymentStatus,
  type CustomerUrgency,
  type DatePreset,
  type FulfillmentFilter,
  type MedicineKind,
  type MedicineQtyMode,
  type MedicineRequest,
  type ProcurementCategory,
  type ProcurementItem,
  type ShopRecordStatus,
} from "@/lib/shop-ops/types";

type TabKey = (typeof SHOP_OPS_TAB_KEYS)[number];
type ListFilter = "pending" | "closed" | "all";
type ShopOpsTable = "shop_procurement_items" | "shop_medicine_requests" | "shop_customer_orders";

const SHOP_OPS_TAB_UI = [
  { key: "medicine" as const, label: "叫藥需求", Icon: Pill },
  { key: "customer" as const, label: "客人訂購", Icon: Package },
  { key: "fulfillment" as const, label: "客訂管理", Icon: ListChecks },
  { key: "procurement" as const, label: "日常採購", Icon: ShoppingBag },
];

function formatWhen(iso: string): string {
  return formatCreatedStamp(iso);
}

function ClosedBatchBar({
  busy,
  reopenSelectedIds,
  reopenVisibleIds,
  deleteSelectedIds,
  deleteVisibleIds,
  onReopen,
  onDelete,
}: {
  busy: boolean;
  reopenSelectedIds: string[];
  reopenVisibleIds: string[];
  deleteSelectedIds: string[];
  deleteVisibleIds: string[];
  onReopen: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
}) {
  if (reopenVisibleIds.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="app-btn-outline"
        disabled={busy || reopenSelectedIds.length === 0}
        onClick={() => onReopen(reopenSelectedIds)}
      >
        所選改回待處理（{reopenSelectedIds.length}）
      </button>
      <button type="button" className="app-btn-outline" disabled={busy} onClick={() => onReopen(reopenVisibleIds)}>
        全部改回待處理
      </button>
      <button
        type="button"
        className="app-btn-outline text-rose-700 border-rose-200 hover:bg-rose-50"
        disabled={busy || deleteSelectedIds.length === 0}
        onClick={() => {
          if (!window.confirm(`確定刪除所選 ${deleteSelectedIds.length} 筆已處理紀錄？刪除後無法復原。`)) return;
          onDelete(deleteSelectedIds);
        }}
      >
        所選刪除（{deleteSelectedIds.length}）
      </button>
      <button
        type="button"
        className="app-btn-outline text-rose-700 border-rose-200 hover:bg-rose-50"
        disabled={busy || deleteVisibleIds.length === 0}
        onClick={() => {
          if (
            !window.confirm(
              `確定刪除 ${deleteVisibleIds.length} 筆已處理紀錄？刪除後無法復原，請先確認篩選範圍。`
            )
          )
            return;
          onDelete(deleteVisibleIds);
        }}
      >
        刪除本篩選全部已處理
      </button>
    </div>
  );
}

function ClosedRowActions({
  busy,
  canDelete,
  onReopen,
  onDelete,
}: {
  busy: boolean;
  canDelete: boolean;
  onReopen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="text-sm text-sky-700 font-medium" disabled={busy} onClick={onReopen}>
        改回待處理
      </button>
      {canDelete ? (
        <button
          type="button"
          className="text-slate-400 hover:text-rose-600"
          disabled={busy}
          title="刪除已處理紀錄"
          onClick={() => {
            if (!window.confirm("確定刪除這筆已處理紀錄？刪除後無法復原。")) return;
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

async function mutateClosedRecords(input: {
  table: ShopOpsTable;
  ids: string[];
  mode: "reopen" | "delete";
  busy: boolean;
  setBusy: (v: boolean) => void;
  onChanged: () => Promise<void>;
  after?: () => void;
}): Promise<void> {
  if (input.ids.length === 0 || input.busy) return;
  input.setBusy(true);
  try {
    if (input.mode === "reopen") {
      await reopenShopRecords({ table: input.table, ids: input.ids });
    } else {
      await deleteShopRecords({ table: input.table, ids: input.ids, status: "closed" });
    }
    input.after?.();
    await input.onChanged();
  } catch (err) {
    alert(err instanceof Error ? err.message : input.mode === "reopen" ? "改回待處理失敗" : "刪除失敗");
  } finally {
    input.setBusy(false);
  }
}

export default function ShopOpsPage() {
  const { currentUser, employees, activeSiteId, storeConfig } = useApp();
  const [tab, setTab] = useState<TabKey>(SHOP_OPS_TAB_KEYS[0]);
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
    void refresh({ silent: false });
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
            叫藥、客人訂購、客訂管理、日常採購。員工先登記，之後標記進度；完成後按已處理。誤按可改回待處理，已處理也可一次刪除。
          </p>
        </div>
      </div>

      <HelpTip
        title="怎麼用"
        hint="先寫下來 → 訂貨／到貨／通知 → 已處理；誤按可改回，清掉可一次刪"
        defaultOpen
        storageKey={`help:shop-ops:${storageScope}`}
      >
        <p>
          1. <strong>叫藥需求</strong>：先登記，再標「已訂貨／已到貨」。欠藥請留電話並標「已通知」；客人來拿後按「已處理」。
        </p>
        <p>
          2. <strong>客人訂購</strong>：可選一般或緊急（緊急可填希望到貨日）。進度為訂貨 → 到貨 → 通知 → 已拿；四項齊了會詢問是否結案。
        </p>
        <p>
          3. <strong>客訂管理</strong>：可一次勾多筆一起標記，也可匯出 Excel／PDF。
        </p>
        <p>4. <strong>日常採購</strong>：文具、影印紙、貼紙等。買好了按「已處理」即可。</p>
        <p>
          5. 待處理可刪。誤按「已處理」可改回待處理。已處理也可勾選後一次刪除（無法復原），避免越積越多。
        </p>
      </HelpTip>

      <div className="flex flex-wrap gap-2">
        {SHOP_OPS_TAB_UI.map(({ key, label, Icon }) => (
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

      {loading && (
        <p className="text-sm text-slate-500">載入紀錄中…（表單可先填）</p>
      )}
      {tab === "procurement" ? (
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
  const allCount = pendingCount + closedCount;
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
        已處理（{closedCount}）
      </button>
      <button
        type="button"
        className={`px-3 py-1.5 rounded-lg text-sm border ${
          value === "all" ? "bg-sky-600 text-white border-sky-600" : "bg-white border-slate-200"
        }`}
        onClick={() => onChange("all")}
      >
        全部（{allCount}）
      </button>
    </div>
  );
}

function DateFilterBar({
  preset,
  onPreset,
  from,
  to,
  onFrom,
  onTo,
}: {
  preset: DatePreset;
  onPreset: (v: DatePreset) => void;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500">登記日</span>
      {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((key) => (
        <button
          key={key}
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm border ${
            preset === key ? "bg-sky-600 text-white border-sky-600" : "bg-white border-slate-200"
          }`}
          onClick={() => onPreset(key)}
        >
          {DATE_PRESET_LABELS[key]}
        </button>
      ))}
      {preset === "custom" && (
        <>
          <input
            type="date"
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={from}
            onChange={(e) => onFrom(e.target.value)}
          />
          <span className="text-slate-400">～</span>
          <input
            type="date"
            className="border rounded-lg px-2 py-1.5 text-sm"
            value={to}
            onChange={(e) => onTo(e.target.value)}
          />
        </>
      )}
    </div>
  );
}

function ChipFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm border ${
            value === opt.value ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200"
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          {opt.count != null ? `（${opt.count}）` : ""}
        </button>
      ))}
    </div>
  );
}

function CreatedBadge({ iso }: { iso: string }) {
  return (
    <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-100">
      登記 {formatCreatedStamp(iso)}
    </span>
  );
}

function StatsLine({ count }: { count: number }) {
  return <p className="text-sm text-slate-600">目前顯示 {count} 筆</p>;
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

function UrgencyBadge({ row }: { row: CustomerOrder }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full ${
        row.urgency === "urgent" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {CUSTOMER_URGENCY_LABELS[row.urgency]}
      {row.urgency === "urgent" && row.wantedArriveDate
        ? ` · 希望 ${formatWantedArriveDate(row.wantedArriveDate)}`
        : ""}
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
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [form, setForm] = useState({
    categoryId: categories[0]?.id ?? "",
    itemName: "",
    quantity: "1",
    unit: "",
    note: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");

  useEffect(() => {
    if (!form.categoryId && categories[0]?.id) {
      setForm((p) => ({ ...p, categoryId: categories[0].id }));
    }
  }, [categories, form.categoryId]);

  const resetForm = (categoryId = categories[0]?.id ?? "") => {
    setEditingId(null);
    setForm({
      categoryId,
      itemName: "",
      quantity: "1",
      unit: "",
      note: "",
    });
  };

  const startEdit = (row: ProcurementItem) => {
    setEditingId(row.id);
    setForm({
      categoryId: row.categoryId ?? categories.find((c) => c.name === row.categoryName)?.id ?? categories[0]?.id ?? "",
      itemName: row.itemName,
      quantity: String(row.quantity),
      unit: row.unit,
      note: row.note,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dateRange = datePresetRange(datePreset, dateFrom, dateTo);
  const byStatus = items.filter((i) => filter === "all" || i.status === filter);
  const visible = sortByCreatedAtAsc(
    byStatus
      .filter((i) => matchesCreatedDate(i.createdAt, dateRange))
      .filter((i) => categoryFilter === "all" || i.categoryName === categoryFilter)
  );
  const closedVisibleIds = visible.filter((row) => row.status === "closed").map((row) => row.id);
  const deletableClosedIds = visible
    .filter((row) => row.status === "closed" && canDeleteShopRecord(row.createdBy, userId, isManager))
    .map((row) => row.id);
  const selectedClosedIds = selected.filter((id) => closedVisibleIds.includes(id));
  const selectedDeletableClosedIds = selected.filter((id) => deletableClosedIds.includes(id));
  const categoryOptions = [
    {
      value: "all",
      label: "全部類別",
      count: byStatus.filter((i) => matchesCreatedDate(i.createdAt, dateRange)).length,
    },
    ...Array.from(new Set(items.map((i) => i.categoryName).filter(Boolean))).map((name) => ({
      value: name,
      label: name,
      count: byStatus.filter((i) => i.categoryName === name && matchesCreatedDate(i.createdAt, dateRange)).length,
    })),
  ];

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
      if (editingId) {
        await updateProcurementItem({
          id: editingId,
          categoryId: cat.id,
          categoryName: cat.name,
          itemName: form.itemName,
          quantity: form.quantity,
          unit: form.unit,
          note: form.note,
        });
      } else {
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
      }
      resetForm(cat.id);
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : editingId ? "修改失敗" : "新增失敗");
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
      alert(err instanceof Error ? err.message : "處理失敗");
    } finally {
      setBusy(false);
    }
  };

  const reopenIds = (ids: string[]) =>
    mutateClosedRecords({
      table: "shop_procurement_items",
      ids,
      mode: "reopen",
      busy,
      setBusy,
      onChanged,
      after: () => setSelected([]),
    });

  const deleteClosedIds = (ids: string[]) =>
    mutateClosedRecords({
      table: "shop_procurement_items",
      ids,
      mode: "delete",
      busy,
      setBusy,
      onChanged,
      after: () => setSelected([]),
    });

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="app-section-title">{editingId ? "修改日常採購" : "登記日常採購"}</h2>
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
        <div className="flex flex-wrap gap-2">
          <button type="button" className="app-btn-primary" disabled={busy} onClick={() => void addItem()}>
            {editingId ? (
              <>
                <Pencil className="h-4 w-4 mr-1" />
                儲存修改
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                寫入待處理
              </>
            )}
          </button>
          {editingId && (
            <button type="button" className="app-btn-outline" disabled={busy} onClick={() => resetForm(form.categoryId)}>
              <X className="h-4 w-4 mr-1" />
              取消修改
            </button>
          )}
        </div>
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
        onChange={(v) => {
          setFilter(v);
          setSelected([]);
        }}
        pendingCount={items.filter((i) => i.status === "pending").length}
        closedCount={items.filter((i) => i.status === "closed").length}
      />
      <DateFilterBar
        preset={datePreset}
        onPreset={setDatePreset}
        from={dateFrom}
        to={dateTo}
        onFrom={setDateFrom}
        onTo={setDateTo}
      />
      <ChipFilter
        label="類別"
        value={categoryFilter}
        onChange={setCategoryFilter}
        options={categoryOptions}
      />
      <StatsLine count={visible.length} />

      {filter === "pending" && visible.length > 0 && (
        <div className="flex gap-2">
          <button
            type="button"
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || selected.length === 0}
            onClick={() => void closeIds(selected)}
          >
            所選已處理（{selected.length}）
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy}
            onClick={() => void closeIds(visible.map((i) => i.id))}
          >
            全部已處理
          </button>
        </div>
      )}
      {filter === "closed" ? (
        <ClosedBatchBar
          busy={busy}
          reopenSelectedIds={selectedClosedIds}
          reopenVisibleIds={closedVisibleIds}
          deleteSelectedIds={selectedDeletableClosedIds}
          deleteVisibleIds={deletableClosedIds}
          onReopen={(ids) => void reopenIds(ids)}
          onDelete={(ids) => void deleteClosedIds(ids)}
        />
      ) : null}

      {visible.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">沒有符合篩選的紀錄</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="app-card p-3 flex flex-wrap items-start gap-3">
              {(filter === "pending" || filter === "closed") && (
                <RecordCheck
                  checked={selected.includes(row.id)}
                  onChange={(checked) =>
                    setSelected((prev) =>
                      checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                    )
                  }
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CreatedBadge iso={row.createdAt} />
                  <span className="text-xs text-slate-500">{row.categoryName}</span>
                  <span className="font-semibold text-slate-900">{row.itemName}</span>
                  <span className="text-slate-700">
                    × {row.quantity}
                    {row.unit ? ` ${row.unit}` : ""}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {nameById.get(row.createdBy) ?? "員工"}
                  {row.closedAt
                    ? ` · 已處理 ${nameById.get(row.closedBy ?? "") ?? ""} ${formatWhen(row.closedAt)}`
                    : ""}
                </p>
                {row.note && <p className="text-sm text-slate-600 mt-1">{row.note}</p>}
              </div>
              {row.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-sm text-sky-700 font-medium"
                    onClick={() => startEdit(row)}
                  >
                    修改
                  </button>
                  <button
                    type="button"
                    className="text-sm text-emerald-700 font-medium"
                    onClick={() => void closeIds([row.id])}
                  >
                    已處理
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
                          if (editingId === row.id) resetForm(form.categoryId);
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
              {row.status === "closed" ? (
                <ClosedRowActions
                  busy={busy}
                  canDelete={canDeleteShopRecord(row.createdBy, userId, isManager)}
                  onReopen={() => void reopenIds([row.id])}
                  onDelete={() => void deleteClosedIds([row.id])}
                />
              ) : null}
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
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | MedicineKind>("all");
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
    contactPhone: "",
    note: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyMedicineForm = {
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
    contactPhone: "",
    note: "",
  };

  const resetForm = (kind: MedicineKind = "shortage") => {
    setEditingId(null);
    setForm({ ...emptyMedicineForm, kind });
  };

  const startEdit = (row: MedicineRequest) => {
    setEditingId(row.id);
    setForm({
      kind: row.kind,
      itemName: row.itemName,
      nhiCode: row.nhiCode,
      qtyMode: row.qtyMode,
      quantity: row.quantity == null ? "" : String(row.quantity),
      unit: row.unit,
      useIc02: row.useIc02,
      ic02Qty: row.ic02Qty == null ? "" : String(row.ic02Qty),
      useIc03: row.useIc03,
      ic03Qty: row.ic03Qty == null ? "" : String(row.ic03Qty),
      currentStock: row.currentStock == null ? "" : String(row.currentStock),
      contactPhone: row.contactPhone,
      note: row.note,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dateRange = datePresetRange(datePreset, dateFrom, dateTo);
  const byStatus = items.filter((i) => filter === "all" || i.status === filter);
  const visible = sortByCreatedAtAsc(
    byStatus
      .filter((i) => matchesCreatedDate(i.createdAt, dateRange))
      .filter((i) => kindFilter === "all" || i.kind === kindFilter)
  );
  const closedVisibleIds = visible.filter((row) => row.status === "closed").map((row) => row.id);
  const deletableClosedIds = visible
    .filter((row) => row.status === "closed" && canDeleteShopRecord(row.createdBy, userId, isManager))
    .map((row) => row.id);
  const selectedClosedIds = selected.filter((id) => closedVisibleIds.includes(id));
  const selectedDeletableClosedIds = selected.filter((id) => deletableClosedIds.includes(id));
  const needsQty = form.kind !== "below_stock";

  const addItem = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (editingId) {
        await updateMedicineRequest({
          id: editingId,
          ...form,
        });
      } else {
        await createMedicineRequest({
          siteId,
          createdBy: userId,
          ...form,
        });
      }
      resetForm(form.kind);
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : editingId ? "修改失敗" : "新增失敗");
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
      alert(err instanceof Error ? err.message : "處理失敗");
    } finally {
      setBusy(false);
    }
  };

  const reopenIds = (ids: string[]) =>
    mutateClosedRecords({
      table: "shop_medicine_requests",
      ids,
      mode: "reopen",
      busy,
      setBusy,
      onChanged,
      after: () => setSelected([]),
    });

  const deleteClosedIds = (ids: string[]) =>
    mutateClosedRecords({
      table: "shop_medicine_requests",
      ids,
      mode: "delete",
      busy,
      setBusy,
      onChanged,
      after: () => setSelected([]),
    });

  const patchMed = async (
    ids: string[],
    fields: { ordered?: boolean; goodsArrived?: boolean; notified?: boolean }
  ) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await updateMedicineFulfillment({ ids, ...fields });
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
        <h2 className="app-section-title">{editingId ? "修改叫藥需求" : "登記叫藥需求"}</h2>
        <p className="text-sm text-slate-600">
          預包、欠藥可直接填數量，或改用第二次／第三次領藥（IC02／IC03）。欠藥請留電話，方便到貨後通知。
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
          {form.kind === "shortage" && (
            <input
              className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
              placeholder="欠藥聯絡電話"
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            />
          )}
          <input
            className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
            placeholder="備註（可空）"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="app-btn-primary" disabled={busy} onClick={() => void addItem()}>
            {editingId ? (
              <>
                <Pencil className="h-4 w-4 mr-1" />
                儲存修改
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                寫入待處理
              </>
            )}
          </button>
          {editingId && (
            <button type="button" className="app-btn-outline" disabled={busy} onClick={() => resetForm(form.kind)}>
              <X className="h-4 w-4 mr-1" />
              取消修改
            </button>
          )}
        </div>
        {!needsQty && <p className="text-xs text-slate-500">低於庫存不必填叫貨數量，先登記現存即可。</p>}
      </div>

      <FilterToggle
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setSelected([]);
        }}
        pendingCount={items.filter((i) => i.status === "pending").length}
        closedCount={items.filter((i) => i.status === "closed").length}
      />
      <DateFilterBar
        preset={datePreset}
        onPreset={setDatePreset}
        from={dateFrom}
        to={dateTo}
        onFrom={setDateFrom}
        onTo={setDateTo}
      />
      <ChipFilter
        label="類型"
        value={kindFilter}
        onChange={(v) => setKindFilter(v as "all" | MedicineKind)}
        options={[
          {
            value: "all",
            label: "全部類型",
            count: byStatus.filter((i) => matchesCreatedDate(i.createdAt, dateRange)).length,
          },
          ...(Object.keys(MEDICINE_KIND_LABELS) as MedicineKind[]).map((k) => ({
            value: k,
            label: MEDICINE_KIND_LABELS[k],
            count: byStatus.filter((i) => i.kind === k && matchesCreatedDate(i.createdAt, dateRange)).length,
          })),
        ]}
      />
      <StatsLine count={visible.length} />

      {filter === "pending" && visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patchMed(selected, { ordered: true })}
          >
            所選已訂貨
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patchMed(selected, { goodsArrived: true })}
          >
            所選已到貨
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patchMed(selected, { notified: true })}
          >
            所選已通知
          </button>
          <button
            type="button"
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || selected.length === 0}
            onClick={() => void closeIds(selected)}
          >
            所選已處理（{selected.length}）
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy}
            onClick={() => void closeIds(visible.map((i) => i.id))}
          >
            全部已處理
          </button>
        </div>
      )}
      {filter === "closed" ? (
        <ClosedBatchBar
          busy={busy}
          reopenSelectedIds={selectedClosedIds}
          reopenVisibleIds={closedVisibleIds}
          deleteSelectedIds={selectedDeletableClosedIds}
          deleteVisibleIds={deletableClosedIds}
          onReopen={(ids) => void reopenIds(ids)}
          onDelete={(ids) => void deleteClosedIds(ids)}
        />
      ) : null}

      {visible.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">沒有符合篩選的紀錄</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="app-card p-3 flex flex-wrap items-start gap-3">
              {(filter === "pending" || filter === "closed") && (
                <RecordCheck
                  checked={selected.includes(row.id)}
                  onChange={(checked) =>
                    setSelected((prev) =>
                      checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                    )
                  }
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CreatedBadge iso={row.createdAt} />
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
                  {nameById.get(row.createdBy) ?? "員工"}
                  {row.closedAt
                    ? ` · 已處理 ${nameById.get(row.closedBy ?? "") ?? ""} ${formatWhen(row.closedAt)}`
                    : ""}
                </p>
                {row.kind === "shortage" && row.contactPhone ? (
                  <p className="text-sm text-slate-700 mt-1">電話 {row.contactPhone}</p>
                ) : null}
                {row.note && <p className="text-sm text-slate-600 mt-1">{row.note}</p>}
                {row.status === "pending" && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <ToggleChip
                      on={row.ordered}
                      onLabel="已訂貨"
                      offLabel="未訂貨"
                      disabled={busy}
                      onClick={() => void patchMed([row.id], { ordered: !row.ordered })}
                    />
                    <ToggleChip
                      on={row.goodsArrived}
                      onLabel="已到貨"
                      offLabel="未到貨"
                      disabled={busy}
                      onClick={() => void patchMed([row.id], { goodsArrived: !row.goodsArrived })}
                    />
                    {row.kind === "shortage" && (
                      <ToggleChip
                        on={row.notified}
                        onLabel="已通知"
                        offLabel="未通知"
                        disabled={busy}
                        onClick={() => void patchMed([row.id], { notified: !row.notified })}
                      />
                    )}
                  </div>
                )}
              </div>
              {row.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-sm text-sky-700 font-medium"
                    onClick={() => startEdit(row)}
                  >
                    修改
                  </button>
                  <button
                    type="button"
                    className="text-sm text-emerald-700 font-medium"
                    onClick={() => void closeIds([row.id])}
                  >
                    已處理
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
                          if (editingId === row.id) resetForm(form.kind);
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
              {row.status === "closed" ? (
                <ClosedRowActions
                  busy={busy}
                  canDelete={canDeleteShopRecord(row.createdBy, userId, isManager)}
                  onReopen={() => void reopenIds([row.id])}
                  onDelete={() => void deleteClosedIds([row.id])}
                />
              ) : null}
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
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | CustomerUrgency>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | CustomerPaymentStatus>("all");
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    productName: "",
    nhiCode: "",
    quantity: "1",
    unit: "",
    amount: "",
    paymentStatus: "unpaid" as CustomerPaymentStatus,
    urgency: "normal" as CustomerUrgency,
    wantedArriveDate: "",
    note: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const emptyCustomerForm = {
    customerName: "",
    customerPhone: "",
    productName: "",
    nhiCode: "",
    quantity: "1",
    unit: "",
    amount: "",
    paymentStatus: "unpaid" as CustomerPaymentStatus,
    urgency: "normal" as CustomerUrgency,
    wantedArriveDate: "",
    note: "",
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyCustomerForm });
  };

  const startEdit = (row: CustomerOrder) => {
    setEditingId(row.id);
    setForm({
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      productName: row.productName,
      nhiCode: row.nhiCode,
      quantity: String(row.quantity),
      unit: row.unit,
      amount: String(row.amount),
      paymentStatus: row.paymentStatus,
      urgency: row.urgency,
      wantedArriveDate: row.wantedArriveDate ?? "",
      note: row.note,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dateRange = datePresetRange(datePreset, dateFrom, dateTo);
  const visible = sortCustomerOrders(
    items
      .filter((i) => filter === "all" || i.status === filter)
      .filter((i) => matchesCreatedDate(i.createdAt, dateRange))
      .filter((i) => urgencyFilter === "all" || i.urgency === urgencyFilter)
      .filter((i) => paymentFilter === "all" || i.paymentStatus === paymentFilter)
  );
  const closedVisibleIds = visible.filter((row) => row.status === "closed").map((row) => row.id);
  const deletableClosedIds = visible
    .filter((row) => row.status === "closed" && canDeleteShopRecord(row.createdBy, userId, isManager))
    .map((row) => row.id);
  const selectedClosedIds = selected.filter((id) => closedVisibleIds.includes(id));
  const selectedDeletableClosedIds = selected.filter((id) => deletableClosedIds.includes(id));

  const addItem = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (editingId) {
        await updateCustomerOrder({
          id: editingId,
          ...form,
        });
      } else {
        await createCustomerOrder({
          siteId,
          handlerId: userId,
          ...form,
        });
      }
      resetForm();
      await onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : editingId ? "修改失敗" : "新增失敗");
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
      alert(err instanceof Error ? err.message : "處理失敗");
    } finally {
      setBusy(false);
    }
  };

  const reopenIds = (ids: string[]) =>
    mutateClosedRecords({
      table: "shop_customer_orders",
      ids,
      mode: "reopen",
      busy,
      setBusy,
      onChanged,
      after: () => setSelected([]),
    });

  const deleteClosedIds = (ids: string[]) =>
    mutateClosedRecords({
      table: "shop_customer_orders",
      ids,
      mode: "delete",
      busy,
      setBusy,
      onChanged,
      after: () => setSelected([]),
    });

  const patch = async (
    ids: string[],
    fields: { ordered?: boolean; goodsArrived?: boolean; notified?: boolean; pickedUp?: boolean }
  ) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await updateCustomerFulfillment({ ids, ...fields });
      const doneIds = items
        .filter((r) => ids.includes(r.id) && r.status === "pending")
        .filter((r) =>
          isCustomerFulfillmentComplete({
            ordered: fields.ordered ?? r.ordered,
            goodsArrived: fields.goodsArrived ?? r.goodsArrived,
            notified: fields.notified ?? r.notified,
            pickedUp: fields.pickedUp ?? r.pickedUp,
          })
        )
        .map((r) => r.id);
      await onChanged();
      if (doneIds.length > 0) {
        const ok = window.confirm(
          doneIds.length === 1
            ? "這筆訂貨、到貨、通知、已拿都完成了，要標成已處理嗎？"
            : `這 ${doneIds.length} 筆四項都完成了，要標成已處理嗎？`
        );
        if (ok) {
          await closeShopRecords({
            table: "shop_customer_orders",
            ids: doneIds,
            closedBy: userId,
          });
          await onChanged();
        }
      }
      setSelected([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="app-card p-4 space-y-3">
        <h2 className="app-section-title">{editingId ? "修改客人訂購" : "登記客人訂購"}</h2>
        <p className="text-sm text-slate-600">
          接手人：<strong>{userName}</strong>
          {editingId ? "（修改不會改接手人）" : "（由誰新增就記誰）"}
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
          <label className="text-sm space-y-1">
            <span className="text-slate-600">緊急程度</span>
            <select
              className="w-full border rounded-xl px-3 py-2"
              value={form.urgency}
              onChange={(e) =>
                setForm({ ...form, urgency: e.target.value as CustomerUrgency, wantedArriveDate: e.target.value === "urgent" ? form.wantedArriveDate : "" })
              }
            >
              <option value="normal">{CUSTOMER_URGENCY_LABELS.normal}</option>
              <option value="urgent">{CUSTOMER_URGENCY_LABELS.urgent}</option>
            </select>
          </label>
          {form.urgency === "urgent" && (
            <label className="text-sm space-y-1">
              <span className="text-slate-600">希望到貨日（選填）</span>
              <input
                type="date"
                className="w-full border rounded-xl px-3 py-2"
                value={form.wantedArriveDate}
                onChange={(e) => setForm({ ...form, wantedArriveDate: e.target.value })}
              />
            </label>
          )}
          <input
            className="border rounded-xl px-3 py-2 text-sm md:col-span-2"
            placeholder="備註（可空）"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="app-btn-primary" disabled={busy} onClick={() => void addItem()}>
            {editingId ? (
              <>
                <Pencil className="h-4 w-4 mr-1" />
                儲存修改
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                寫入待處理
              </>
            )}
          </button>
          {editingId && (
            <button type="button" className="app-btn-outline" disabled={busy} onClick={resetForm}>
              <X className="h-4 w-4 mr-1" />
              取消修改
            </button>
          )}
        </div>
      </div>

      <FilterToggle
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setSelected([]);
        }}
        pendingCount={items.filter((i) => i.status === "pending").length}
        closedCount={items.filter((i) => i.status === "closed").length}
      />
      <DateFilterBar
        preset={datePreset}
        onPreset={setDatePreset}
        from={dateFrom}
        to={dateTo}
        onFrom={setDateFrom}
        onTo={setDateTo}
      />
      <ChipFilter
        label="緊急"
        value={urgencyFilter}
        onChange={(v) => setUrgencyFilter(v as "all" | CustomerUrgency)}
        options={[
          { value: "all", label: "全部" },
          { value: "urgent", label: CUSTOMER_URGENCY_LABELS.urgent },
          { value: "normal", label: CUSTOMER_URGENCY_LABELS.normal },
        ]}
      />
      <ChipFilter
        label="付款"
        value={paymentFilter}
        onChange={(v) => setPaymentFilter(v as "all" | CustomerPaymentStatus)}
        options={[
          { value: "all", label: "全部" },
          { value: "unpaid", label: CUSTOMER_PAYMENT_LABELS.unpaid },
          { value: "paid", label: CUSTOMER_PAYMENT_LABELS.paid },
        ]}
      />
      <StatsLine count={visible.length} />

      {filter === "pending" && visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patch(selected, { ordered: true })}
          >
            所選已訂貨
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patch(selected, { goodsArrived: true })}
          >
            所選已到貨
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patch(selected, { notified: true })}
          >
            所選已通知
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() => void patch(selected, { pickedUp: true })}
          >
            所選已拿
          </button>
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() =>
              void patch(selected, {
                ordered: true,
                goodsArrived: true,
                notified: true,
                pickedUp: true,
              })
            }
          >
            所選四項完成
          </button>
          <button
            type="button"
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || selected.length === 0}
            onClick={() => void closeIds(selected)}
          >
            所選已處理（{selected.length}）
          </button>
        </div>
      )}
      {filter === "closed" ? (
        <ClosedBatchBar
          busy={busy}
          reopenSelectedIds={selectedClosedIds}
          reopenVisibleIds={closedVisibleIds}
          deleteSelectedIds={selectedDeletableClosedIds}
          deleteVisibleIds={deletableClosedIds}
          onReopen={(ids) => void reopenIds(ids)}
          onDelete={(ids) => void deleteClosedIds(ids)}
        />
      ) : null}

      {visible.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">沒有符合篩選的紀錄</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="app-card p-3 flex flex-wrap items-start gap-3">
              {(filter === "pending" || filter === "closed") && (
                <RecordCheck
                  checked={selected.includes(row.id)}
                  onChange={(checked) =>
                    setSelected((prev) =>
                      checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                    )
                  }
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CreatedBadge iso={row.createdAt} />
                  <span className="font-semibold text-slate-900">{row.customerName}</span>
                  <span className="text-slate-600">{row.customerPhone}</span>
                  <UrgencyBadge row={row} />
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
                  接手 {nameById.get(row.handlerId) ?? "員工"}
                  {row.closedAt
                    ? ` · 已處理 ${nameById.get(row.closedBy ?? "") ?? ""} ${formatWhen(row.closedAt)}`
                    : ""}
                </p>
                {row.note && <p className="text-sm text-slate-600 mt-1">{row.note}</p>}
                {row.status === "pending" && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <ToggleChip
                      on={row.ordered}
                      onLabel="已訂貨"
                      offLabel="未訂貨"
                      disabled={busy}
                      onClick={() => void patch([row.id], { ordered: !row.ordered })}
                    />
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
                )}
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
                      className="text-sm text-sky-700 font-medium"
                      onClick={() => startEdit(row)}
                    >
                      修改
                    </button>
                    <button
                      type="button"
                      className="text-sm text-emerald-700 font-medium"
                      onClick={() => void closeIds([row.id])}
                    >
                      已處理
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
                            if (editingId === row.id) resetForm();
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
                {row.status === "closed" ? (
                  <ClosedRowActions
                    busy={busy}
                    canDelete={canDeleteShopRecord(row.createdBy, userId, isManager)}
                    onReopen={() => void reopenIds([row.id])}
                    onDelete={() => void deleteClosedIds([row.id])}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordCheck({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className="mt-0.5 h-7 w-7 shrink-0 cursor-pointer accent-sky-600"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
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
  const [statusFilter, setStatusFilter] = useState<ListFilter>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | CustomerUrgency>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | CustomerPaymentStatus>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const handlerName = (id: string) => nameById.get(id) ?? "員工";
  const dateRange = datePresetRange(datePreset, dateFrom, dateTo);
  const visible = sortCustomerOrders(
    items
      .filter((row) => matchesFulfillmentFilter(row, filter))
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => matchesCreatedDate(row.createdAt, dateRange))
      .filter((row) => urgencyFilter === "all" || row.urgency === urgencyFilter)
      .filter((row) => paymentFilter === "all" || row.paymentStatus === paymentFilter)
  );
  const closeableSelected = selected.filter((id) => {
    const row = items.find((r) => r.id === id);
    if (!row) return false;
    if (row.status !== "pending") return false;
    return row.createdBy === userId || isManager;
  });
  const closeableVisible = visible
    .filter((row) => row.status === "pending" && (row.createdBy === userId || isManager))
    .map((r) => r.id);
  const closedVisibleIds = visible.filter((row) => row.status === "closed").map((row) => row.id);
  const deletableClosedIds = visible
    .filter((row) => row.status === "closed" && canDeleteShopRecord(row.createdBy, userId, isManager))
    .map((row) => row.id);
  const selectedClosedIds = selected.filter((id) => closedVisibleIds.includes(id));
  const selectedDeletableClosedIds = selected.filter((id) => deletableClosedIds.includes(id));

  const patch = async (
    ids: string[],
    fields: { ordered?: boolean; goodsArrived?: boolean; notified?: boolean; pickedUp?: boolean }
  ) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await updateCustomerFulfillment({ ids, ...fields });
      const doneIds = items
        .filter((r) => ids.includes(r.id) && r.status === "pending")
        .filter((r) =>
          isCustomerFulfillmentComplete({
            ordered: fields.ordered ?? r.ordered,
            goodsArrived: fields.goodsArrived ?? r.goodsArrived,
            notified: fields.notified ?? r.notified,
            pickedUp: fields.pickedUp ?? r.pickedUp,
          })
        )
        .map((r) => r.id);
      await onChanged();
      if (doneIds.length > 0) {
        const ok = window.confirm(
          doneIds.length === 1
            ? "這筆訂貨、到貨、通知、已拿都完成了，要標成已處理嗎？"
            : `這 ${doneIds.length} 筆四項都完成了，要標成已處理嗎？`
        );
        if (ok) {
          await closeShopRecords({
            table: "shop_customer_orders",
            ids: doneIds,
            closedBy: userId,
          });
          await onChanged();
        }
      }
      setSelected([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
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
      alert(err instanceof Error ? err.message : "處理失敗");
    } finally {
      setBusy(false);
    }
  };

  const reopenIds = (ids: string[]) =>
    mutateClosedRecords({
      table: "shop_customer_orders",
      ids,
      mode: "reopen",
      busy,
      setBusy,
      onChanged,
      after: () => setSelected([]),
    });

  const deleteClosedIds = (ids: string[]) =>
    mutateClosedRecords({
      table: "shop_customer_orders",
      ids,
      mode: "delete",
      busy,
      setBusy,
      onChanged,
      after: () => setSelected([]),
    });

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
              void exportCustomerOrdersPdf({
                storeName,
                rows: visible,
                handlerName,
              })
            }
          >
            <Printer className="h-4 w-4" />
            匯出 PDF
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
      <DateFilterBar
        preset={datePreset}
        onPreset={setDatePreset}
        from={dateFrom}
        to={dateTo}
        onFrom={setDateFrom}
        onTo={setDateTo}
      />
      <ChipFilter
        label="狀態"
        value={statusFilter}
        onChange={(v) => setStatusFilter(v as ListFilter)}
        options={[
          { value: "all", label: "全部" },
          { value: "pending", label: SHOP_STATUS_LABELS.pending },
          { value: "closed", label: SHOP_STATUS_LABELS.closed },
        ]}
      />
      <ChipFilter
        label="緊急"
        value={urgencyFilter}
        onChange={(v) => setUrgencyFilter(v as "all" | CustomerUrgency)}
        options={[
          { value: "all", label: "全部" },
          { value: "urgent", label: CUSTOMER_URGENCY_LABELS.urgent },
          { value: "normal", label: CUSTOMER_URGENCY_LABELS.normal },
        ]}
      />
      <ChipFilter
        label="付款"
        value={paymentFilter}
        onChange={(v) => setPaymentFilter(v as "all" | CustomerPaymentStatus)}
        options={[
          { value: "all", label: "全部" },
          { value: "unpaid", label: CUSTOMER_PAYMENT_LABELS.unpaid },
          { value: "paid", label: CUSTOMER_PAYMENT_LABELS.paid },
        ]}
      />
      <StatsLine count={visible.length} />

      {visible.length > 0 && statusFilter !== "closed" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-btn-primary bg-emerald-600 hover:bg-emerald-700"
            disabled={busy || selected.length === 0}
            onClick={() => void patch(selected, { ordered: true })}
          >
            所選標記已訂貨
          </button>
          <button
            type="button"
            className="app-btn-outline"
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
          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || selected.length === 0}
            onClick={() =>
              void patch(selected, {
                ordered: true,
                goodsArrived: true,
                notified: true,
                pickedUp: true,
              })
            }
          >
            所選四項完成
          </button>

          <button
            type="button"
            className="app-btn-primary bg-slate-800 hover:bg-slate-900"
            disabled={busy || closeableSelected.length === 0}
            onClick={() => {
              if (
                !window.confirm(
                  `確定要完成「${closeableSelected.length}」筆訂單？完成後會變更為已處理（若誤按可改回待處理）。`
                )
              )
                return;
              void closeIds(closeableSelected);
            }}
          >
            訂單完成（{closeableSelected.length}）
          </button>

          <button
            type="button"
            className="app-btn-outline"
            disabled={busy || closeableVisible.length === 0}
            onClick={() => {
              if (
                !window.confirm(
                  `確定要完成本篩選內「${closeableVisible.length}」筆訂單？完成後會變更為已處理（若誤按可改回待處理）。`
                )
              )
                return;
              void closeIds(closeableVisible);
            }}
          >
            全部訂單完成
          </button>
        </div>
      )}
      {statusFilter === "closed" ? (
        <ClosedBatchBar
          busy={busy}
          reopenSelectedIds={selectedClosedIds}
          reopenVisibleIds={closedVisibleIds}
          deleteSelectedIds={selectedDeletableClosedIds}
          deleteVisibleIds={deletableClosedIds}
          onReopen={(ids) => void reopenIds(ids)}
          onDelete={(ids) => void deleteClosedIds(ids)}
        />
      ) : null}

      {visible.length === 0 ? (
        <div className="app-card p-6 text-center text-slate-500">沒有符合篩選的客訂</div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="app-card p-3 flex flex-wrap items-start gap-3">
              <RecordCheck
                checked={selected.includes(row.id)}
                onChange={(checked) =>
                  setSelected((prev) =>
                    checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                  )
                }
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CreatedBadge iso={row.createdAt} />
                  <span className="font-semibold text-slate-900">{row.customerName}</span>
                  <span className="text-slate-600">{row.customerPhone}</span>
                  <UrgencyBadge row={row} />
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
                  接手 {handlerName(row.handlerId)}
                </p>
                {row.note && <p className="text-sm text-slate-600 mt-1">{row.note}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  <ToggleChip
                    on={row.ordered}
                    onLabel="已訂貨"
                    offLabel="未訂貨"
                    disabled={busy || row.status === "closed"}
                    onClick={() => void patch([row.id], { ordered: !row.ordered })}
                  />
                  <ToggleChip
                    on={row.goodsArrived}
                    onLabel="已到貨"
                    offLabel="未到貨"
                    disabled={busy || row.status === "closed"}
                    onClick={() => void patch([row.id], { goodsArrived: !row.goodsArrived })}
                  />
                  <ToggleChip
                    on={row.notified}
                    onLabel="已通知"
                    offLabel="未通知"
                    disabled={busy || row.status === "closed"}
                    onClick={() => void patch([row.id], { notified: !row.notified })}
                  />
                  <ToggleChip
                    on={row.pickedUp}
                    onLabel="已拿"
                    offLabel="未拿"
                    disabled={busy || row.status === "closed"}
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
              {row.status === "closed" ? (
                <ClosedRowActions
                  busy={busy}
                  canDelete={canDeleteShopRecord(row.createdBy, userId, isManager)}
                  onReopen={() => void reopenIds([row.id])}
                  onDelete={() => void deleteClosedIds([row.id])}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
