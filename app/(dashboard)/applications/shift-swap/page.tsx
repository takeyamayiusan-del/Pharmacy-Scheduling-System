"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { canManageSite } from "@/lib/auth/roles";
import { useSearchParams } from "next/navigation";
import { currentMonthMinDate } from "@/lib/schedule/monthAccess";
import { LeaveOrderGuide } from "@/components/schedule/LeaveOrderGuide";
import { HelpTip } from "@/components/ui/HelpTip";
import {
  assertNoSundayInSwapDates,
  isFixedSundayRest,
  SUNDAY_REST_MESSAGE,
} from "@/lib/schedule/sundayRest";
import {
  approvalPendingLabel,
  canActOnApprovalStep,
  currentApprovalRole,
  effectiveApprovalChain,
} from "@/lib/approvals/chain";
import {
  MonthFilterBar,
  getCurrentYearMonth,
  isDateInYearMonth,
} from "@/components/MonthFilterBar";

export default function ShiftSwapPage() {
  const {
    currentUser, employees, swapRequests,
    addSwapRequest, updateSwapRequestStatus, deleteSwapRequest, getShiftForDate,
    activeSiteId, storeConfig,
  } = useApp();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ requesterDate: "", targetDate: "", targetEmployeeId: "" });
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const initialPeriod = getCurrentYearMonth();
  const [filterYear, setFilterYear] = useState(initialPeriod.year);
  const [filterMonth, setFilterMonth] = useState(initialPeriod.month);

  const runSwapAction = async (id: string, action: () => Promise<void>) => {
    if (actionId) return;
    setActionId(id);
    try {
      await action();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失敗，請稍後再試");
    } finally {
      setActionId(null);
    }
  };

  const source = searchParams.get("source");
  const sourceNote = searchParams.get("source_note");
  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;
  const swapTargets = useMemo(() => employees.filter(e => e.role !== "owner"), [employees]);

  useEffect(() => {
    const requesterDate = searchParams.get("date") || searchParams.get("requesterDate");
    const targetDate = searchParams.get("targetDate");
    const targetEmployeeId = searchParams.get("targetEmployeeId");
    if (!requesterDate && !targetEmployeeId) return;
    setShowForm(true);
    setFormData(prev => ({
      requesterDate: requesterDate || prev.requesterDate,
      // targetDate 保持空白，讓使用者自己選擇目標日期
      targetDate: targetDate || prev.targetDate,
      targetEmployeeId: targetEmployeeId || prev.targetEmployeeId,
    }));
  }, [searchParams]);

  const previewRequesterShift = currentUser && formData.requesterDate
    ? getShiftForDate(formData.requesterDate, currentUser.id) : null;
  const previewTargetShift = formData.targetEmployeeId && formData.targetDate
    ? getShiftForDate(formData.targetDate, formData.targetEmployeeId) : null;

  const sundayFixedRest = storeConfig.policies.sundayFixedRest;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const sundayCheck = assertNoSundayInSwapDates(
      formData.requesterDate,
      formData.targetDate,
      sundayFixedRest
    );
    if (!sundayCheck.ok) {
      alert(sundayCheck.message);
      return;
    }
    const targetEmployee = employees.find(emp => emp.id === formData.targetEmployeeId);
    if (!targetEmployee) return;
    try {
      await addSwapRequest({
        requesterId: currentUser.id,
        requesterName: currentUser.name,
        targetEmployeeId: targetEmployee.id,
        targetEmployeeName: targetEmployee.name,
        requesterDate: formData.requesterDate,
        targetDate: formData.targetDate,
        status: "pending_confirmation",
      });
      setFormData({ requesterDate: "", targetDate: "", targetEmployeeId: "" });
      setShowForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "申請失敗");
    }
  };

  const isManager = canManageSite(currentUser?.role);
  const approvalChain = effectiveApprovalChain(
    storeConfig.policies.approvalChain,
    employees,
    activeSiteId
  );
  const approvalMode = storeConfig.policies.approvalMode;

  const getStatusLabel = (status: string, approvalStep = 0) => {
    if (status === "pending_approval") {
      return approvalPendingLabel(approvalChain, approvalStep, approvalMode);
    }
    return ({
      pending_confirmation: "等待對方確認",
      pending_approval: "等待管理者審核",
      approved: "已核准",
      rejected: "已拒絕",
    }[status] ?? status);
  };

  const getStatusClass = (status: string) => ({
    pending_confirmation: "bg-yellow-100 text-yellow-800",
    pending_approval: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  }[status] ?? "bg-gray-100 text-gray-800");

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? id;

  const siteEmployeeIds = useMemo(
    () => new Set(employees.map((e) => e.id)),
    [employees]
  );

  const visibleRequests = useMemo(() => {
    return swapRequests.filter((r) => {
      const inMonth =
        isDateInYearMonth(r.requesterDate, filterYear, filterMonth) ||
        isDateInYearMonth(r.targetDate, filterYear, filterMonth);
      if (!inMonth) return false;
      if (isManager) {
        return (
          siteEmployeeIds.has(r.requesterId) || siteEmployeeIds.has(r.targetEmployeeId)
        );
      }
      return (
        r.requesterId === currentUser?.id || r.targetEmployeeId === currentUser?.id
      );
    });
  }, [
    swapRequests,
    filterYear,
    filterMonth,
    isManager,
    siteEmployeeIds,
    currentUser?.id,
  ]);

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <h2 className="app-page-title">換班申請</h2>
        {currentUser?.role !== "owner" && (
          <button onClick={() => setShowForm(true)} className="app-btn-primary">新申請</button>
        )}
      </div>

      <HelpTip
        title="換班流程說明"
        hint="發起 → 對方確認 → 審核"
        storageKey={`help:shift-swap-flow:${storageScope}`}
      >
        <p><span className="font-medium text-sky-800">換班流程：</span>發起申請 → 對方確認 → 依店規關卡審核（預設店長→副店→老闆）→ 最後一關才寫入班表</p>
        <p>與自己換班：兩日班別對調。與他人換班：雙方在「換出日／換入日」出勤整段互換；取消審核或刪除已核准申請會還原班表。</p>
        <p className="text-rose-700 font-medium">禮拜日為全店固定公休，不可列入換班。</p>
        <p className="text-emerald-800">
          建議：若是為了排休／晚班衝突，請<strong>先完成換班</strong>，再到「排休選擇」點選日期（即時儲存、無確認鍵）。
        </p>
      </HelpTip>

      <LeaveOrderGuide compact />

      {source === "wednesday_conflict" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          {sourceNote || "由禮三晚班衝突引導建立換班申請"}
        </div>
      )}

      {source === "leave_evening_conflict" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          {sourceNote || "由排休選擇（全天班含晚班）引導建立換班申請"}
        </div>
      )}

      {showForm && (
        <div className="app-panel p-6">
          <h3 className="font-medium text-gray-900 mb-4">新換班申請</h3>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">我的日期（換出）</label>
                <input type="date" value={formData.requesterDate} min={currentMonthMinDate()}
                  onChange={e => setFormData({ ...formData, requesterDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" required />
                {isFixedSundayRest(formData.requesterDate, sundayFixedRest) && (
                  <p className="text-xs text-red-600 mt-1">{SUNDAY_REST_MESSAGE}</p>
                )}
                {previewRequesterShift && !isFixedSundayRest(formData.requesterDate, sundayFixedRest) && (
                  <p className="text-xs text-gray-500 mt-1">當日班別：{previewRequesterShift}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">對方日期（換入）</label>
                <input type="date" value={formData.targetDate} min={currentMonthMinDate()}
                  onChange={e => setFormData({ ...formData, targetDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" required />
                {isFixedSundayRest(formData.targetDate, sundayFixedRest) && (
                  <p className="text-xs text-red-600 mt-1">{SUNDAY_REST_MESSAGE}</p>
                )}
                {previewTargetShift && !isFixedSundayRest(formData.targetDate, sundayFixedRest) && (
                  <p className="text-xs text-gray-500 mt-1">對方班別：{previewTargetShift}</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">換班對象</label>
              <select value={formData.targetEmployeeId}
                onChange={e => setFormData({ ...formData, targetEmployeeId: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg" required>
                <option value="">請選擇</option>
                {swapTargets.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.id === currentUser?.id ? `${emp.name}（與自己換班）` : emp.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">送出</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            </div>
          </form>
        </div>
      )}

      <div className="app-panel overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-gray-900">換班申請記錄</h3>
          <MonthFilterBar
            year={filterYear}
            month={filterMonth}
            onYearChange={setFilterYear}
            onMonthChange={setFilterMonth}
            count={visibleRequests.length}
          />
        </div>
        <div className="divide-y">
          {visibleRequests.length === 0 && (
            <div className="p-8 text-center text-gray-500">本月沒有換班申請記錄</div>
          )}
          {visibleRequests.map(req => {
            const requesterName = req.requesterName || getEmpName(req.requesterId);
            const targetName = req.targetEmployeeName || getEmpName(req.targetEmployeeId);
            const isSelfSwap = req.requesterId === req.targetEmployeeId;
            const isTarget = currentUser?.id === req.targetEmployeeId && !isSelfSwap;
            const isRequester = currentUser?.id === req.requesterId;
            const canConfirm = isTarget && req.status === "pending_confirmation";
            const canManagerAct =
              isManager &&
              req.status === "pending_approval" &&
              canActOnApprovalStep(
                currentUser?.role,
                currentApprovalRole(approvalChain, req.approvalStep ?? 0),
                approvalMode
              );
            const waitingTarget = isRequester && req.status === "pending_confirmation" && !isSelfSwap;

            return (
              <div key={req.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-medium text-gray-900">
                      {requesterName}{isSelfSwap ? "（自行換班）" : ` ↔ ${targetName}`}
                    </p>
                    <p className="text-sm text-gray-600">
                      {requesterName} 的 {req.requesterDate} ↔ {isSelfSwap ? "自己的" : `${targetName} 的`} {req.targetDate}
                    </p>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getStatusClass(req.status)}`}>
                      {getStatusLabel(req.status, req.approvalStep ?? 0)}
                    </span>
                    {req.status === "rejected" && req.rejectReason && (
                      <p className="text-sm text-red-700 mt-2">駁回／拒絕原因：{req.rejectReason}</p>
                    )}
                    {waitingTarget && (
                      <p className="text-sm text-amber-700 mt-2">已送出邀請，等待 {targetName} 確認後店長才能審核。</p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {/* 對方確認/拒絕 */}
                    {canConfirm && (
                      <>
                        <button
                          disabled={actionId === req.id}
                          onClick={() => runSwapAction(req.id, () => updateSwapRequestStatus(req.id, "pending_approval"))}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionId === req.id ? "處理中…" : "確認換班"}
                        </button>
                        <button
                          onClick={() => setRejectModal({ id: req.id, reason: "" })}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                        >
                          拒絕邀請
                        </button>
                      </>
                    )}
                    {/* 管理者審核 */}
                    {canManagerAct && (
                      <>
                        <button
                          disabled={actionId === req.id}
                          onClick={() => runSwapAction(req.id, () => updateSwapRequestStatus(req.id, "approved"))}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionId === req.id ? "處理中…" : "核准"}
                        </button>
                        <button onClick={() => setRejectModal({ id: req.id, reason: "" })}
                          className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600">駁回</button>
                      </>
                    )}
                    {/* 管理者取消審核 */}
                    {isManager && (req.status === "approved" || req.status === "rejected") && (
                      <button
                        disabled={actionId === req.id}
                        onClick={() => runSwapAction(req.id, () => updateSwapRequestStatus(req.id, "pending_approval"))}
                        className="px-2 py-1 border rounded text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        {actionId === req.id ? "處理中…" : "取消審核"}
                      </button>
                    )}
                    {/* 刪除 */}
                    {isManager && (
                      <button onClick={async () => {
                          if (!confirm("確定刪除？")) return;
                          try {
                            await deleteSwapRequest(req.id);
                          } catch (error) {
                            console.error(error);
                            alert(error instanceof Error ? error.message : '刪除失敗，請稍後再試。');
                          }
                        }}
                        className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">刪除</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="app-panel p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-3">填寫拒絕原因</h3>
            <textarea value={rejectModal.reason}
              onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3" rows={3} placeholder="請輸入原因（選填）" />
            <div className="flex gap-2">
              <button
                disabled={!!actionId}
                onClick={() => {
                  if (!rejectModal) return;
                  void runSwapAction(rejectModal.id, async () => {
                    await updateSwapRequestStatus(rejectModal.id, "rejected", rejectModal.reason);
                    setRejectModal(null);
                  });
                }}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {actionId ? "處理中…" : "確認"}
              </button>
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2 border rounded-lg text-sm">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
