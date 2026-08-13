"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/lib/context/AppContext";
import { currentMonthMinDate } from "@/lib/schedule/monthAccess";
import { formatCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";
import { calcOvertimeHours } from "@/lib/attendance/overtimeCompensation";
import {
  canChooseOvertimePayWithPolicy,
  overtimePolicyHint,
  resolveCompensationWithPolicy,
  validateOvertimeWithPolicy,
} from "@/lib/attendance/overtimePolicy";
import {
  MonthFilterBar,
  getCurrentYearMonth,
  isDateInYearMonth,
} from "@/components/MonthFilterBar";
import { approvalPendingLabel, effectiveApprovalChain } from "@/lib/approvals/chain";
import { HelpTip } from "@/components/ui/HelpTip";

function formatCompLeaveAmount(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  const minutes = Math.round(Math.abs(hours) * 60);
  const displayHours = formatCompLeaveHours(rounded);
  return `${rounded > 0 ? "+" : ""}${displayHours} 小時（${minutes} 分鐘）`;
}

export default function OvertimePage() {
  const {
    currentUser,
    employees,
    overtimeRequests,
    addOvertimeRequest,
    updateOvertimeRequestStatus,
    updateOvertimeCompensation,
    deleteOvertimeRequest,
    punchRecords,
    compLeaveLedger,
    getCompLeaveBalance,
    grantCompLeaveHours,
    activeSiteId,
    storeConfig,
  } = useApp();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: "",
    startTime: "",
    endTime: "",
    reason: "",
    compensationType: "time_off" as "pay" | "time_off",
  });
  const [targetEmployeeId, setTargetEmployeeId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const date = searchParams.get("date");
    const reason = searchParams.get("reason");
    const startTime = searchParams.get("start");
    const endTime = searchParams.get("end");
    if (date || reason || startTime || endTime) {
      setFormData((prev) => ({
        ...prev,
        date: date || prev.date,
        reason: reason || prev.reason,
        startTime: startTime || prev.startTime,
        endTime: endTime || prev.endTime,
        compensationType: resolveCompensationWithPolicy(
          startTime || prev.startTime,
          endTime || prev.endTime,
          prev.compensationType,
          storeConfig.policies
        ),
      }));
      setShowForm(true);
    }
  }, [searchParams, storeConfig.policies]);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [grantForm, setGrantForm] = useState({
    employeeId: "",
    amount: "",
    unit: "hours" as "hours" | "minutes",
    note: "",
  });
  const [historyEmployeeId, setHistoryEmployeeId] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const initialPeriod = getCurrentYearMonth();
  const [filterYear, setFilterYear] = useState(initialPeriod.year);
  const [filterMonth, setFilterMonth] = useState(initialPeriod.month);
  const [filterEmployeeId, setFilterEmployeeId] = useState("");
  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;

  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager" || currentUser?.role === "deputy";
  const staffEmployees = useMemo(
    () => employees.filter((e) => e.role !== "owner"),
    [employees]
  );
  const formEmployeeId = isManager
    ? targetEmployeeId || currentUser?.id || ""
    : currentUser?.id || "";
  const formEmployee = employees.find((e) => e.id === formEmployeeId) ?? currentUser;
  // 店長／老闆可補登過去月份；員工僅能申請當月起
  const dateMin = isManager ? undefined : currentMonthMinDate();

  const adjustmentHistory = useMemo(() => {
    const items = compLeaveLedger.filter((entry) => entry.sourceType === "adjustment");
    if (!historyEmployeeId) return items;
    return items.filter((entry) => entry.employeeId === historyEmployeeId);
  }, [compLeaveLedger, historyEmployeeId]);

  const recentAdjustments = adjustmentHistory.slice(0, 2);

  const renderAdjustmentRow = (entry: (typeof adjustmentHistory)[number], compact = false) => (
    <div
      key={entry.id}
      className={`flex items-start justify-between gap-2 ${compact ? "py-1.5" : "py-2 border-t first:border-t-0"}`}
    >
      <div className="min-w-0">
        <p className="text-xs text-gray-900">
          {employees.find((e) => e.id === entry.employeeId)?.name ?? "—"}
          <span className="text-gray-400 mx-1">·</span>
          <span className="text-gray-500">
            {new Date(entry.createdAt).toLocaleString("zh-TW", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
        {entry.note && (
          <p className={`text-gray-400 truncate ${compact ? "text-[10px]" : "text-xs"}`}>
            {entry.note}
          </p>
        )}
      </div>
      <span
        className={`text-xs font-medium whitespace-nowrap ${entry.hours > 0 ? "text-emerald-700" : "text-red-600"}`}
      >
        {formatCompLeaveAmount(entry.hours)}
      </span>
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !formEmployee || isSubmitting) return;
    if (isManager && !targetEmployeeId) {
      alert("請選擇加班員工");
      return;
    }

    const compensationError = validateOvertimeWithPolicy(
      formData.startTime,
      formData.endTime,
      formData.compensationType,
      storeConfig.policies
    );
    if (compensationError) {
      alert(compensationError);
      return;
    }

    const compensationType = resolveCompensationWithPolicy(
      formData.startTime,
      formData.endTime,
      formData.compensationType,
      storeConfig.policies
    );

    setIsSubmitting(true);
    try {
      await addOvertimeRequest({
        employeeId: formEmployee.id,
        employeeName: formEmployee.name,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        reason: formData.reason,
        compensationType,
        status: "pending",
      });
      setFormData({ date: "", startTime: "", endTime: "", reason: "", compensationType: "time_off" });
      setTargetEmployeeId("");
      setShowForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "申請失敗");
    } finally {
      setIsSubmitting(false);
    }
  };

  const overtimeMinutesPreview =
    formData.startTime && formData.endTime
      ? calcOvertimeHours(formData.startTime, formData.endTime)
      : 0;
  const payAllowed = canChooseOvertimePayWithPolicy(
    formData.startTime,
    formData.endTime,
    storeConfig.policies,
  );

  const approvalChain = effectiveApprovalChain(
    storeConfig.policies.approvalChain,
    employees,
    activeSiteId
  );
  const statusLabels: Record<string, { label: string; color: string }> = {
    pending:  { label: "待審核", color: "bg-yellow-100 text-yellow-800" },
    approved: { label: "已核准", color: "bg-green-100 text-green-800" },
    rejected: { label: "已駁回", color: "bg-red-100 text-red-800" },
  };

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? id;

  const handleReviewOvertime = async (
    id: string,
    status: "approved" | "rejected" | "pending",
    rejectReason?: string
  ) => {
    try {
      await updateOvertimeRequestStatus(id, status, rejectReason);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "審核失敗，請稍後再試。");
    }
  };

  const handleChangeCompensation = async (
    id: string,
    compensationType: "pay" | "time_off",
    employeeName: string
  ) => {
    const label = compensationType === "pay" ? "加班費" : "補休";
    if (
      !confirm(
        `確定將「${employeeName}」這筆加班改為「${label}」？\n已核准者會同步調整補休時數。`
      )
    ) {
      return;
    }
    try {
      await updateOvertimeCompensation(id, compensationType);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "調整失敗，請稍後再試。");
    }
  };

  const siteEmployeeIds = useMemo(
    () => new Set(employees.map((e) => e.id)),
    [employees]
  );

  const visibleRequests = useMemo(() => {
    const scoped = isManager
      ? overtimeRequests.filter((r) => siteEmployeeIds.has(r.employeeId))
      : overtimeRequests.filter((r) => r.employeeId === currentUser?.id);
    return scoped.filter((r) => {
      if (!isDateInYearMonth(r.date, filterYear, filterMonth)) return false;
      if (isManager && filterEmployeeId && r.employeeId !== filterEmployeeId) {
        return false;
      }
      return true;
    });
  }, [
    isManager,
    overtimeRequests,
    currentUser?.id,
    filterYear,
    filterMonth,
    filterEmployeeId,
    siteEmployeeIds,
  ]);

  const filterHoursSummary = useMemo(() => {
    const approved = visibleRequests.filter((r) => r.status === "approved");
    if (approved.length === 0) return "";
    const payHours = Math.round(
      approved
        .filter((r) => r.compensationType === "pay")
        .reduce((sum, r) => sum + calcOvertimeHours(r.startTime, r.endTime), 0) * 100
    ) / 100;
    const timeOffHours = Math.round(
      approved
        .filter((r) => r.compensationType === "time_off")
        .reduce((sum, r) => sum + calcOvertimeHours(r.startTime, r.endTime), 0) * 100
    ) / 100;
    const nameHint =
      isManager && filterEmployeeId
        ? `${employees.find((e) => e.id === filterEmployeeId)?.name ?? ""} `
        : "";
    const parts = [
      payHours > 0 ? `加班費 ${payHours}h` : null,
      timeOffHours > 0 ? `補休 ${timeOffHours}h` : null,
    ].filter(Boolean);
    if (parts.length === 0) {
      return `${nameHint}核准加班合計 0 小時`;
    }
    return `${nameHint}核准：${parts.join("、")}`;
  }, [visibleRequests, isManager, filterEmployeeId, employees]);

  const handleGrantCompLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantForm.employeeId || isGranting) return;
    const raw = Number(grantForm.amount);
    if (!Number.isFinite(raw) || raw === 0) {
      alert("請輸入有效的時數或分鐘數（可為正數核發、負數扣回）");
      return;
    }

    const hours =
      grantForm.unit === "minutes"
        ? Math.round((raw / 60) * 100) / 100
        : Math.round(raw * 100) / 100;

    if (hours === 0) {
      alert("換算後時數為 0，請輸入較大的數值");
      return;
    }

    setIsGranting(true);
    try {
      await grantCompLeaveHours(grantForm.employeeId, hours, grantForm.note);
      setGrantForm({ employeeId: "", amount: "", unit: "hours", note: "" });
      alert(hours > 0 ? "補休時數已核發" : "補休時數已扣回");
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setIsGranting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <h2 className="app-page-title">加班申請</h2>
        <button
          onClick={() => setShowForm(true)}
          className="app-btn-primary"
        >
          {isManager ? "新增／補登" : "新申請"}
        </button>
      </div>

      <HelpTip
        title="加班申請說明"
        hint="時段、加班費／補休"
        defaultOpen
        storageKey={`help:overtime-apply:${storageScope}`}
      >
        <p>• 點「新申請」填寫加班日期與起迄時間，送出後由店長／老闆審核。</p>
        <p>• 可依規則選擇「加班費」或「補休」；部分時段可能僅能選其中一種。</p>
        <p>• 下班逾時時，打卡頁也可能引導你快速送出加班申請。</p>
        <p>• 跨月後員工無法自行申請過去月份；店長可代為補登。</p>
      </HelpTip>

      {isManager && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          跨月後員工無法自行申請過去月份；店長／老闆可在此手動補登加班（可代選員工）。
        </p>
      )}

      {showForm && (
        <div className="app-panel p-6">
          <h3 className="font-medium text-gray-900 mb-4">
            {isManager ? "新加班申請／補登" : "新加班申請"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            {isManager && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">加班員工</label>
                <select
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="">請選擇員工</option>
                  {staffEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
              <input
                type="date"
                value={formData.date}
                min={dateMin}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
              {isManager && (
                <p className="text-xs text-gray-500 mt-1">可選過去月份日期（手動補登）</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始時間</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => {
                    const startTime = e.target.value;
                    const nextComp = resolveCompensationWithPolicy(
                      startTime,
                      formData.endTime,
                      formData.compensationType,
                      storeConfig.policies
                    );
                    setFormData({ ...formData, startTime, compensationType: nextComp });
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">結束時間</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => {
                    const endTime = e.target.value;
                    const nextComp = resolveCompensationWithPolicy(
                      formData.startTime,
                      endTime,
                      formData.compensationType,
                      storeConfig.policies
                    );
                    setFormData({ ...formData, endTime, compensationType: nextComp });
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
            </div>
            {formData.startTime && formData.endTime && (
              <p className="text-xs text-gray-500">
                預估加班：{overtimeMinutesPreview} 小時
                <span className="ml-2 text-amber-700">
                  {overtimePolicyHint(formData.startTime, formData.endTime, storeConfig.policies)}
                </span>
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">加班原因</label>
              <textarea value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg" rows={3} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">補償方式</label>
              <div className="flex flex-wrap gap-4">
                <label
                  className={`flex items-center gap-2 ${payAllowed ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                >
                  <input
                    type="radio"
                    name="comp"
                    value="pay"
                    disabled={!payAllowed}
                    checked={formData.compensationType === "pay"}
                    onChange={() =>
                      setFormData({ ...formData, compensationType: "pay" })
                    }
                  />
                  <span>加班費</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="comp"
                    value="time_off"
                    checked={formData.compensationType === "time_off"}
                    onChange={() =>
                      setFormData({ ...formData, compensationType: "time_off" })
                    }
                  />
                  <span>補休</span>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {overtimePolicyHint(
                  formData.startTime,
                  formData.endTime,
                  storeConfig.policies,
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "送出中..." : "送出"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            </div>
          </form>
        </div>
      )}

      {isManager && (
        <div className="app-panel overflow-hidden">
          <div className="p-4 border-b bg-emerald-50">
            <h3 className="font-medium text-gray-900">補休時數管理</h3>
            <p className="text-xs text-gray-600 mt-1">
              店長／老闆可手動核發或扣回員工補休時數（半年內有效）。請假可先請補休（餘額可為負），之後加班轉補休會加回。
            </p>
          </div>

          <div className="p-4 grid gap-6 lg:grid-cols-2">
            <form onSubmit={handleGrantCompLeave} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">員工</label>
                <select
                  value={grantForm.employeeId}
                  onChange={(e) => setGrantForm((prev) => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  required
                >
                  <option value="">— 選擇員工 —</option>
                  {staffEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}（可用 {formatCompLeaveHours(getCompLeaveBalance(emp.id))} 小時）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">調整數量</label>
                <div className="flex gap-2 mb-2">
                  {[
                    { v: "hours" as const, l: "小時" },
                    { v: "minutes" as const, l: "分鐘" },
                  ].map((opt) => (
                    <label key={opt.v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="comp-unit"
                        checked={grantForm.unit === opt.v}
                        onChange={() => setGrantForm((prev) => ({ ...prev, unit: opt.v }))}
                      />
                      {opt.l}
                    </label>
                  ))}
                </div>
                <input
                  type="number"
                  step={grantForm.unit === "minutes" ? "1" : "0.01"}
                  value={grantForm.amount}
                  onChange={(e) => setGrantForm((prev) => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder={
                    grantForm.unit === "minutes"
                      ? "例如：30 或 -15（扣回）"
                      : "例如：2、0.5（30分）或 -1"
                  }
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  支援小數點後兩位；{grantForm.unit === "hours" ? "0.5 = 30 分鐘" : "30 分鐘 = 0.5 小時"}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備註（選填）</label>
                <input
                  type="text"
                  value={grantForm.note}
                  onChange={(e) => setGrantForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="例如：週末支援核發"
                />
              </div>
              <button
                type="submit"
                disabled={isGranting}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {isGranting ? "處理中..." : "確認調整補休"}
              </button>
            </form>

            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">員工補休餘額</h4>
              <div className="border rounded-lg divide-y max-h-56 overflow-y-auto">
                {staffEmployees.map((emp) => (
                  <div key={emp.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-gray-900">{emp.name}</span>
                    <span
                      className={`font-semibold ${
                        getCompLeaveBalance(emp.id) < 0 ? "text-amber-700" : "text-emerald-700"
                      }`}
                    >
                      {formatCompLeaveHours(getCompLeaveBalance(emp.id))} 小時
                      {getCompLeaveBalance(emp.id) < 0 ? "（借支）" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {adjustmentHistory.length > 0 && (
            <div className="border-t px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h4 className="text-xs font-medium text-gray-600">近期手動調整</h4>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(true)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  查看全部（{adjustmentHistory.length} 筆）
                </button>
              </div>
              <div className="divide-y">
                {recentAdjustments.map((entry) => renderAdjustmentRow(entry, true))}
              </div>
            </div>
          )}
        </div>
      )}

      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="app-panel w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
            <div className="p-4 border-b flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">手動調整紀錄</h3>
                <p className="text-xs text-gray-500">共 {adjustmentHistory.length} 筆</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={historyEmployeeId}
                  onChange={(e) => setHistoryEmployeeId(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1.5"
                >
                  <option value="">全部員工</option>
                  {staffEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
                >
                  關閉
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-4">
              {adjustmentHistory.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">沒有紀錄</p>
              ) : (
                <div className="border rounded-lg divide-y">
                  {adjustmentHistory.map((entry) => renderAdjustmentRow(entry))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="app-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-gray-900">加班申請記錄</h3>
          <MonthFilterBar
            year={filterYear}
            month={filterMonth}
            onYearChange={setFilterYear}
            onMonthChange={setFilterMonth}
            count={visibleRequests.length}
            employeeFilter={
              isManager
                ? {
                    value: filterEmployeeId,
                    onChange: setFilterEmployeeId,
                    options: staffEmployees.map((e) => ({ id: e.id, name: e.name })),
                  }
                : undefined
            }
            summaryText={filterHoursSummary || undefined}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">員工</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">日期</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">時間</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">工時</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">原因</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">補償</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">當日打卡</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">狀態</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">審核說明</th>
                {isManager && <th className="px-4 py-3 text-left font-medium text-gray-700">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRequests.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-gray-500">本月沒有加班申請記錄</td></tr>
              )}
              {visibleRequests.map(req => {
                const st = statusLabels[req.status];
                const statusText =
                  req.status === "pending"
                    ? approvalPendingLabel(approvalChain, req.approvalStep ?? 0)
                    : st.label;
                const h = calcOvertimeHours(req.startTime, req.endTime);
                const empName = req.employeeName || getEmpName(req.employeeId);
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{empName}</td>
                    <td className="px-4 py-3 text-gray-600">{req.date}</td>
                    <td className="px-4 py-3 text-gray-600">{req.startTime} - {req.endTime}</td>
                    <td className="px-4 py-3 text-gray-600">{h} 小時</td>
                    <td className="px-4 py-3 text-gray-600">{req.reason}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex flex-col gap-1">
                        <span>{req.compensationType === "pay" ? "加班費" : "補休"}</span>
                        {isManager && (
                          <button
                            type="button"
                            onClick={() =>
                              handleChangeCompensation(
                                req.id,
                                req.compensationType === "pay" ? "time_off" : "pay",
                                empName
                              )
                            }
                            className="text-left text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            改為{req.compensationType === "pay" ? "補休" : "加班費"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const dayPunches = punchRecords.filter(p => p.employeeId === req.employeeId && p.date === req.date);
                        return dayPunches.length > 0 ? (
                          <div className="space-y-1">
                            {dayPunches.map((p, idx) => (
                              <div key={idx} className="text-gray-600">
                                {p.action === "work_in" ? "上班" : "下班"}: {p.time}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">— 無打卡</span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{statusText}</span>
                    </td>
                    <td className="px-4 py-3 text-sm max-w-xs">
                      {req.status === "rejected" && req.rejectReason ? (
                        <span className="text-red-700">{req.rejectReason}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {isManager && (
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {req.status === "pending" && (
                            <>
                              <button onClick={() => handleReviewOvertime(req.id, "approved")}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">核准</button>
                              <button onClick={() => setRejectModal({ id: req.id, reason: "" })}
                                className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600">駁回</button>
                            </>
                          )}
                          {req.status !== "pending" && (
                            <button onClick={() => handleReviewOvertime(req.id, "pending")}
                              className="px-2 py-1 border rounded text-xs hover:bg-gray-50">取消審核</button>
                          )}
                          <button onClick={async () => {
                              if (!confirm("確定刪除？")) return;
                              try {
                                await deleteOvertimeRequest(req.id);
                              } catch (error) {
                                console.error(error);
                                alert(error instanceof Error ? error.message : '刪除失敗，請稍後再試。');
                              }
                            }}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">刪除</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="app-panel p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-3">填寫駁回原因</h3>
            <textarea value={rejectModal.reason}
              onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3" rows={3} placeholder="請輸入駁回原因（選填）" />
            <div className="flex gap-2">
              <button onClick={async () => {
                  await handleReviewOvertime(rejectModal.id, "rejected", rejectModal.reason);
                  setRejectModal(null);
                }}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">確認駁回</button>
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2 border rounded-lg text-sm">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
