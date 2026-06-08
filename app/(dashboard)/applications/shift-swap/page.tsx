"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { useSearchParams } from "next/navigation";

export default function ShiftSwapPage() {
  const {
    currentUser, employees, swapRequests,
    addSwapRequest, updateSwapRequestStatus, deleteSwapRequest, getShiftForDate,
  } = useApp();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ requesterDate: "", targetDate: "", targetEmployeeId: "" });
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);

  const source = searchParams.get("source");
  const sourceNote = searchParams.get("source_note");
  const swapTargets = useMemo(() => employees.filter(e => e.role !== "owner"), [employees]);

  useEffect(() => {
    const requesterDate = searchParams.get("date") || searchParams.get("requesterDate");
    const targetDate = searchParams.get("targetDate");
    const targetEmployeeId = searchParams.get("targetEmployeeId");
    if (!requesterDate && !targetEmployeeId) return;
    setShowForm(true);
    setFormData(prev => ({
      requesterDate: requesterDate || prev.requesterDate,
      targetDate: targetDate || requesterDate || prev.targetDate,
      targetEmployeeId: targetEmployeeId || prev.targetEmployeeId,
    }));
  }, [searchParams]);

  const previewRequesterShift = currentUser && formData.requesterDate
    ? getShiftForDate(formData.requesterDate, currentUser.id) : null;
  const previewTargetShift = formData.targetEmployeeId && formData.targetDate
    ? getShiftForDate(formData.targetDate, formData.targetEmployeeId) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const targetEmployee = employees.find(emp => emp.id === formData.targetEmployeeId);
    if (!targetEmployee) return;
    addSwapRequest({
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
  };

  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";

  const getStatusLabel = (status: string) => ({
    pending_confirmation: "等待對方確認",
    pending_approval: "等待管理者審核",
    approved: "已核准",
    rejected: "已拒絕",
  }[status] ?? status);

  const getStatusClass = (status: string) => ({
    pending_confirmation: "bg-yellow-100 text-yellow-800",
    pending_approval: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  }[status] ?? "bg-gray-100 text-gray-800");

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">換班申請</h2>
        {currentUser?.role !== "owner" && (
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">新申請</button>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-gray-700">
        <span className="font-medium text-blue-800">換班流程：</span>
        發起申請 → 對方確認 → 管理者審核 → 完成
      </div>

      {source === "wednesday_conflict" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          {sourceNote || "由禮三晚班衝突引導建立換班申請"}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-medium text-gray-900 mb-4">新換班申請</h3>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">我的日期（換出）</label>
                <input type="date" value={formData.requesterDate}
                  onChange={e => setFormData({ ...formData, requesterDate: e.target.value, targetDate: formData.targetDate || e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" required />
                {previewRequesterShift && <p className="text-xs text-gray-500 mt-1">當日班別：{previewRequesterShift}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">對方日期（換入）</label>
                <input type="date" value={formData.targetDate}
                  onChange={e => setFormData({ ...formData, targetDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" required />
                {previewTargetShift && <p className="text-xs text-gray-500 mt-1">對方班別：{previewTargetShift}</p>}
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

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">換班申請記錄</h3>
        </div>
        <div className="divide-y">
          {swapRequests.length === 0 && (
            <div className="p-8 text-center text-gray-500">沒有換班申請記錄</div>
          )}
          {swapRequests.map(req => {
            const requesterName = req.requesterName || getEmpName(req.requesterId);
            const targetName = req.targetEmployeeName || getEmpName(req.targetEmployeeId);
            const isSelfSwap = req.requesterId === req.targetEmployeeId;
            const isTarget = currentUser?.id === req.targetEmployeeId && !isSelfSwap;
            const isRequester = currentUser?.id === req.requesterId;
            const canConfirm = isTarget && req.status === "pending_confirmation";
            const canManagerAct = isManager && req.status === "pending_approval";
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
                      {getStatusLabel(req.status)}
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
                          onClick={async () => {
                            await updateSwapRequestStatus(req.id, "pending_approval");
                          }}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          確認換班
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
                        <button onClick={() => updateSwapRequestStatus(req.id, "approved")}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">核准</button>
                        <button onClick={() => setRejectModal({ id: req.id, reason: "" })}
                          className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600">駁回</button>
                      </>
                    )}
                    {/* 管理者取消審核 */}
                    {isManager && (req.status === "approved" || req.status === "rejected") && (
                      <button onClick={() => updateSwapRequestStatus(req.id, "pending_approval")}
                        className="px-2 py-1 border rounded text-xs hover:bg-gray-50">取消審核</button>
                    )}
                    {/* 刪除 */}
                    {isManager && (
                      <button onClick={async () => {
                          if (!confirm("確定刪除？")) return;
                          try {
                            await deleteSwapRequest(req.id);
                          } catch (error) {
                            console.error(error);
                            alert('刪除失敗，請稍後再試。');
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
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-3">填寫拒絕原因</h3>
            <textarea value={rejectModal.reason}
              onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3" rows={3} placeholder="請輸入原因（選填）" />
            <div className="flex gap-2">
              <button onClick={async () => {
                await updateSwapRequestStatus(rejectModal.id, "rejected", rejectModal.reason);
                setRejectModal(null);
              }} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">確認</button>
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2 border rounded-lg text-sm">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
