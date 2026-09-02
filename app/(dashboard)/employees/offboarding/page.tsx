"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApp, type Employee } from "@/lib/context/AppContext";
import { canManageEmployees } from "@/lib/auth/permissions";
import { buildSettlementPreview } from "@/lib/offboarding/settlementPreview";
import { statutoryNoticeDays, monthsOfServiceAsOf } from "@/lib/offboarding/severance";
import {
  OFFBOARDING_TYPE_LABELS,
  PENSION_SYSTEM_LABELS,
  type OffboardingRecord,
  type OffboardingType,
  type PensionSystem,
  type SettlementSnapshot,
} from "@/lib/offboarding/types";
import { getDefaultPayrollPeriod } from "@/lib/payroll/monthlyHours";
import { mapSalaryItemRow } from "@/lib/payroll/salaryItems";
import { createClient } from "@/lib/supabase/client";
import { SITES } from "@/lib/sites";
import { FileText, RefreshCw, UserMinus } from "lucide-react";

type CandidateEmployee = Employee & { isActive: boolean };

type SalaryConfig = {
  baseSalary: number;
  hourlyRate: number;
};

const emptyForm = () => {
  const { year, month } = getDefaultPayrollPeriod();
  return {
    userId: "",
    offboardingType: "resignation" as OffboardingType,
    pensionSystem: "new" as PensionSystem,
    noticeStartDate: "",
    noticeEndDate: "",
    lastWorkDate: new Date().toISOString().slice(0, 10),
    settlementYear: year,
    settlementMonth: month,
    averageMonthlyWage: "",
    manualSeverancePay: "",
    manualAnnualLeavePayout: "",
    manualCompLeavePayout: "",
    otherPayout: "",
    otherDeduction: "",
    deactivateOnComplete: false,
    notes: "",
  };
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || `請求失敗（${res.status}）`);
  }
  return payload;
}

export default function EmployeeOffboardingPage() {
  const {
    currentUser,
    storeConfig,
    activeSiteId,
    getShiftForDate,
    getHolidayInfo,
    shiftTimeConfig,
    leaveRequests,
    overtimeRequests,
    punchRecords,
    getAnnualLeaveQuota,
    getAnnualLeaveBalance,
    getCompLeaveBalance,
  } = useApp();

  const [candidates, setCandidates] = useState<CandidateEmployee[]>([]);
  const [records, setRecords] = useState<OffboardingRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [salaryConfig, setSalaryConfig] = useState<SalaryConfig>({ baseSalary: 0, hourlyRate: 0 });
  const [salaryItems, setSalaryItems] = useState<ReturnType<typeof mapSalaryItemRow>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const actor = { role: currentUser?.role, capabilities: currentUser?.capabilities };
  const allowed = canManageEmployees(actor, storeConfig.policies);

  const selectedEmployee = useMemo(
    () => candidates.find((e) => e.id === form.userId) ?? null,
    [candidates, form.userId]
  );

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId]
  );

  const annualLeaveYear = useMemo(() => {
    const d = form.lastWorkDate || new Date().toISOString().slice(0, 10);
    return Number(d.slice(0, 4));
  }, [form.lastWorkDate]);

  const annualLeaveBalanceDays = selectedEmployee
    ? getAnnualLeaveBalance(selectedEmployee.id, annualLeaveYear)
    : 0;
  const annualLeaveQuotaDays = selectedEmployee
    ? getAnnualLeaveQuota(selectedEmployee, annualLeaveYear)
    : 0;
  const compLeaveBalanceHours = selectedEmployee
    ? getCompLeaveBalance(selectedEmployee.id)
    : 0;

  const preview: SettlementSnapshot | null = useMemo(() => {
    if (!selectedEmployee) return null;
    return buildSettlementPreview({
      employee: selectedEmployee,
      offboardingType: form.offboardingType,
      pensionSystem: form.pensionSystem,
      lastWorkDate: form.lastWorkDate,
      settlementYear: form.settlementYear,
      settlementMonth: form.settlementMonth,
      annualLeaveBalanceDays,
      annualLeaveQuotaDays,
      compLeaveBalanceHours,
      salaryConfig,
      salaryItems,
      averageMonthlyWageOverride: form.averageMonthlyWage ? Number(form.averageMonthlyWage) : null,
      manualSeverancePay: form.manualSeverancePay !== "" ? Number(form.manualSeverancePay) : null,
      manualAnnualLeavePayout:
        form.manualAnnualLeavePayout !== "" ? Number(form.manualAnnualLeavePayout) : null,
      manualCompLeavePayout:
        form.manualCompLeavePayout !== "" ? Number(form.manualCompLeavePayout) : null,
      otherPayout: form.otherPayout ? Number(form.otherPayout) : 0,
      otherDeduction: form.otherDeduction ? Number(form.otherDeduction) : 0,
      getShiftForDate,
      getHolidayInfo,
      shiftTimeConfig,
      leaveRequests,
      overtimeRequests,
      punchRecords,
      storeConfig,
    });
  }, [
    selectedEmployee,
    form,
    annualLeaveBalanceDays,
    annualLeaveQuotaDays,
    compLeaveBalanceHours,
    salaryConfig,
    salaryItems,
    getShiftForDate,
    getHolidayInfo,
    shiftTimeConfig,
    leaveRequests,
    overtimeRequests,
    punchRecords,
    storeConfig,
  ]);

  const employeePunches = useMemo(() => {
    if (!selectedEmployee) return [];
    const prefix = `${form.settlementYear}-${String(form.settlementMonth).padStart(2, "0")}`;
    return punchRecords
      .filter((p) => p.employeeId === selectedEmployee.id && p.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [selectedEmployee, punchRecords, form.settlementYear, form.settlementMonth]);

  const loadSalaryForEmployee = useCallback(async (userId: string) => {
    if (!userId) {
      setSalaryConfig({ baseSalary: 0, hourlyRate: 0 });
      setSalaryItems([]);
      return;
    }
    const supabase = createClient();
    const [cfgRes, itemRes] = await Promise.all([
      supabase.from("employee_salary_config").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("employee_salary_items").select("*").eq("user_id", userId).order("sort_order"),
    ]);
    if (cfgRes.data) {
      setSalaryConfig({
        baseSalary: Number(cfgRes.data.base_salary ?? 0),
        hourlyRate: Number(cfgRes.data.hourly_rate ?? 0),
      });
    } else {
      setSalaryConfig({ baseSalary: 0, hourlyRate: 0 });
    }
    setSalaryItems((itemRes.data ?? []).map((r) => mapSalaryItemRow(r as Record<string, unknown>)));
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cand, rec] = await Promise.all([
        apiJson<{ employees: CandidateEmployee[] }>("/api/employees/offboarding/candidates"),
        apiJson<{ records: OffboardingRecord[] }>("/api/employees/offboarding"),
      ]);
      setCandidates(cand.employees);
      setRecords(rec.records);
    } catch (e) {
      alert(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) void refreshAll();
  }, [allowed, refreshAll]);

  useEffect(() => {
    void loadSalaryForEmployee(form.userId);
  }, [form.userId, loadSalaryForEmployee]);

  const applyRecordToForm = (record: OffboardingRecord) => {
    setSelectedId(record.id);
    setForm({
      userId: record.userId,
      offboardingType: record.offboardingType,
      pensionSystem: record.pensionSystem,
      noticeStartDate: record.noticeStartDate ?? "",
      noticeEndDate: record.noticeEndDate ?? "",
      lastWorkDate: record.lastWorkDate,
      settlementYear: record.settlementYear,
      settlementMonth: record.settlementMonth,
      averageMonthlyWage: record.averageMonthlyWage != null ? String(record.averageMonthlyWage) : "",
      manualSeverancePay: record.manualSeverancePay != null ? String(record.manualSeverancePay) : "",
      manualAnnualLeavePayout:
        record.manualAnnualLeavePayout != null ? String(record.manualAnnualLeavePayout) : "",
      manualCompLeavePayout:
        record.manualCompLeavePayout != null ? String(record.manualCompLeavePayout) : "",
      otherPayout: record.otherPayout ? String(record.otherPayout) : "",
      otherDeduction: record.otherDeduction ? String(record.otherDeduction) : "",
      deactivateOnComplete: record.deactivateOnComplete,
      notes: record.notes,
    });
  };

  const buildPayload = () => ({
    userId: form.userId,
    offboardingType: form.offboardingType,
    pensionSystem: form.pensionSystem,
    noticeStartDate: form.noticeStartDate || null,
    noticeEndDate: form.noticeEndDate || null,
    lastWorkDate: form.lastWorkDate,
    settlementYear: form.settlementYear,
    settlementMonth: form.settlementMonth,
    averageMonthlyWage: form.averageMonthlyWage ? Number(form.averageMonthlyWage) : null,
    manualSeverancePay: form.manualSeverancePay !== "" ? Number(form.manualSeverancePay) : null,
    manualAnnualLeavePayout:
      form.manualAnnualLeavePayout !== "" ? Number(form.manualAnnualLeavePayout) : null,
    manualCompLeavePayout:
      form.manualCompLeavePayout !== "" ? Number(form.manualCompLeavePayout) : null,
    otherPayout: form.otherPayout ? Number(form.otherPayout) : 0,
    otherDeduction: form.otherDeduction ? Number(form.otherDeduction) : 0,
    deactivateOnComplete: form.deactivateOnComplete,
    notes: form.notes,
    snapshot: preview,
  });

  const handleSave = async (complete = false) => {
    if (!form.userId || !form.lastWorkDate) {
      alert("請選擇員工並填寫最後工作日");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (selectedId) {
        await apiJson(`/api/employees/offboarding/${selectedId}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...payload,
            status: complete ? "completed" : undefined,
            applyEndDate: !complete,
          }),
        });
      } else {
        const created = await apiJson<{ record: OffboardingRecord }>("/api/employees/offboarding", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (complete) {
          await apiJson(`/api/employees/offboarding/${created.record.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "completed", applyEndDate: true }),
          });
        } else {
          setSelectedId(created.record.id);
        }
      }
      await refreshAll();
      alert(complete ? "離職結清已結案" : "已儲存草稿");
    } catch (e) {
      alert(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !window.confirm("確定刪除此草稿？")) return;
    setSaving(true);
    try {
      await apiJson(`/api/employees/offboarding/${selectedId}`, { method: "DELETE" });
      setSelectedId(null);
      setForm(emptyForm());
      await refreshAll();
    } catch (e) {
      alert(e instanceof Error ? e.message : "刪除失敗");
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser) return null;

  if (!allowed) {
    return (
      <div className="app-card p-8 text-center text-slate-600">
        您沒有員工管理權限，無法使用離職結清。
      </div>
    );
  }

  const monthsOfService = selectedEmployee
    ? monthsOfServiceAsOf(selectedEmployee.hireDate, form.lastWorkDate)
    : 0;
  const noticeDays = statutoryNoticeDays(monthsOfService);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="app-page-title flex items-center gap-2">
            <UserMinus className="h-7 w-7 text-sky-600" />
            離職結清
          </h2>
          <p className="app-meta mt-1">
            資遣／自離／退休試算：預告期間、資遣費、未休特休與補休、結算月打卡紀錄。
            目前店別：{SITES[activeSiteId].displayName}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="app-btn-outline" onClick={() => void refreshAll()}>
            <RefreshCw className="h-4 w-4 inline mr-1" />
            重新載入
          </button>
          <button
            type="button"
            className="app-btn-outline"
            onClick={() => {
              setSelectedId(null);
              setForm(emptyForm());
            }}
          >
            新增結清
          </button>
          <Link href="/employees" className="app-btn-outline">
            員工管理
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="app-card p-8 text-center text-slate-500">載入中…</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="app-card p-3 space-y-2 max-h-[70vh] overflow-y-auto">
            <h3 className="app-section-title px-1">結清紀錄</h3>
            {records.length === 0 && (
              <p className="text-sm text-slate-500 px-1">尚無紀錄，請右側新增。</p>
            )}
            {records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => applyRecordToForm(record)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm transition ${
                  selectedId === record.id
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-100 hover:bg-slate-50"
                }`}
              >
                <div className="font-medium text-slate-900">
                  {record.employeeName ?? "員工"}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {OFFBOARDING_TYPE_LABELS[record.offboardingType]} · 最後工作日 {record.lastWorkDate}
                </div>
                <div className="text-xs mt-1">
                  <span
                    className={
                      record.status === "completed"
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }
                  >
                    {record.status === "completed" ? "已結案" : "草稿"}
                  </span>
                </div>
              </button>
            ))}
          </aside>

          <div className="space-y-6">
            <div className="app-card p-5 space-y-4">
              <h3 className="app-section-title">基本資料</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-sm text-slate-600">員工</span>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.userId}
                    onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                    disabled={selectedRecord?.status === "completed"}
                  >
                    <option value="">請選擇</option>
                    {candidates.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                        {!emp.isActive ? "（已停用）" : ""}
                        {emp.endDate ? ` · 到期 ${emp.endDate}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">離職類型</span>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.offboardingType}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        offboardingType: e.target.value as OffboardingType,
                      }))
                    }
                  >
                    {Object.entries(OFFBOARDING_TYPE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">資遣費制度</span>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.pensionSystem}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pensionSystem: e.target.value as PensionSystem,
                      }))
                    }
                  >
                    {Object.entries(PENSION_SYSTEM_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">最後工作日</span>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.lastWorkDate}
                    onChange={(e) => setForm((f) => ({ ...f, lastWorkDate: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">結算月份</span>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      className="w-24 border rounded-lg px-3 py-2"
                      value={form.settlementYear}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, settlementYear: Number(e.target.value) }))
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      max={12}
                      className="w-20 border rounded-lg px-3 py-2"
                      value={form.settlementMonth}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, settlementMonth: Number(e.target.value) }))
                      }
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">預告開始日</span>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.noticeStartDate}
                    onChange={(e) => setForm((f) => ({ ...f, noticeStartDate: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">預告結束日</span>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={form.noticeEndDate}
                    onChange={(e) => setForm((f) => ({ ...f, noticeEndDate: e.target.value }))}
                  />
                </label>
              </div>

              {selectedEmployee && (
                <p className="text-sm text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                  入職 {selectedEmployee.hireDate} · 至最後工作日約 {monthsOfService} 個月年資
                  {noticeDays > 0 && ` · 建議預告 ${noticeDays} 日`}
                </p>
              )}

              <label className="block">
                <span className="text-sm text-slate-600">備註</span>
                <textarea
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.deactivateOnComplete}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deactivateOnComplete: e.target.checked }))
                  }
                />
                結案時一併停用帳號（歷史打卡仍保留）
              </label>
            </div>

            {preview && (
              <>
                <div className="app-card p-5 space-y-4">
                  <h3 className="app-section-title">結清試算</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <StatCard label="估計月薪" value={`$${preview.estimatedMonthlyWage.toLocaleString()}`} />
                    <StatCard label="特休餘額" value={`${preview.annualLeaveBalanceDays.toFixed(1)} 天`} />
                    <StatCard label="補休餘額" value={`${preview.compLeaveBalanceHours} 小時`} />
                    <StatCard label="資遣費試算" value={`$${preview.severancePay.toLocaleString()}`} />
                    <StatCard
                      label="特休代金試算"
                      value={`$${preview.annualLeavePayout.toLocaleString()}`}
                    />
                    <StatCard
                      label="補休代金試算"
                      value={`$${preview.compLeavePayout.toLocaleString()}`}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs text-slate-500">平均月薪（覆寫試算）</span>
                      <input
                        type="number"
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        placeholder={String(preview.estimatedMonthlyWage)}
                        value={form.averageMonthlyWage}
                        onChange={(e) => setForm((f) => ({ ...f, averageMonthlyWage: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">資遣費（手動覆寫）</span>
                      <input
                        type="number"
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        placeholder={String(preview.severancePay)}
                        value={form.manualSeverancePay}
                        onChange={(e) => setForm((f) => ({ ...f, manualSeverancePay: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">特休代金（手動覆寫）</span>
                      <input
                        type="number"
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        placeholder={String(preview.annualLeavePayout)}
                        value={form.manualAnnualLeavePayout}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, manualAnnualLeavePayout: e.target.value }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">補休代金（手動覆寫）</span>
                      <input
                        type="number"
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        placeholder={String(preview.compLeavePayout)}
                        value={form.manualCompLeavePayout}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, manualCompLeavePayout: e.target.value }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">其他加給</span>
                      <input
                        type="number"
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        value={form.otherPayout}
                        onChange={(e) => setForm((f) => ({ ...f, otherPayout: e.target.value }))}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-slate-500">其他扣款</span>
                      <input
                        type="number"
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                        value={form.otherDeduction}
                        onChange={(e) => setForm((f) => ({ ...f, otherDeduction: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                    <p className="text-sm text-emerald-900">
                      試算合計（不含最後月薪資結算）：
                      <strong className="text-lg ml-2">
                        ${preview.totalEstimatedPayout.toLocaleString()}
                      </strong>
                    </p>
                    <p className="text-xs text-emerald-800 mt-1">
                      最後月薪資請至「薪資結算」依實際出勤結算後加總。
                    </p>
                  </div>

                  <ul className="text-xs text-slate-600 space-y-1 list-disc pl-5">
                    {preview.legalNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>

                <div className="app-card p-5 space-y-3">
                  <h3 className="app-section-title flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    結算月出勤（{form.settlementYear}/{form.settlementMonth}）
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-4 text-sm">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      應出勤工時 {preview.settlementMonthWorkHours} h
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      加班 {preview.settlementMonthOvertimeHours} h
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      請假 {preview.settlementMonthLeaveHours} h
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      打卡 {preview.punchRecordCount} 筆
                    </div>
                  </div>
                  {employeePunches.length > 0 ? (
                    <ul className="text-sm divide-y divide-slate-100 border rounded-lg">
                      {employeePunches.map((p) => (
                        <li key={p.id} className="flex justify-between px-3 py-2">
                          <span>
                            {p.date} {p.action === "work_in" ? "上班" : "下班"}
                          </span>
                          <span className="font-mono tabular-nums">{p.time}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">此月尚無打卡紀錄。</p>
                  )}
                  <Link href="/attendance" className="text-sm text-sky-700 hover:underline">
                    前往工時統計匯出完整報表 →
                  </Link>
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="app-btn-primary"
                disabled={saving || selectedRecord?.status === "completed"}
                onClick={() => void handleSave(false)}
              >
                {saving ? "處理中…" : "儲存草稿"}
              </button>
              <button
                type="button"
                className="app-btn-outline"
                disabled={saving || selectedRecord?.status === "completed"}
                onClick={() => {
                  if (
                    !window.confirm(
                      "結案將寫入員工到期日，並可選擇停用帳號。確定結案？"
                    )
                  ) {
                    return;
                  }
                  void handleSave(true);
                }}
              >
                結案
              </button>
              {selectedId && selectedRecord?.status === "draft" && (
                <button
                  type="button"
                  className="app-btn-outline text-rose-700 border-rose-200"
                  disabled={saving}
                  onClick={() => void handleDelete()}
                >
                  刪除草稿
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}
