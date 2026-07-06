"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/lib/context/AppContext";
import { currentMonthMinDate } from "@/lib/schedule/monthAccess";

const SOURCE_LABELS: Record<string, string> = {
  adjustment: "手動調整",
  overtime_credit: "加班累積",
  leave_debit: "請假使用",
  reversal: "取消退回",
  expiry: "過期",
};

export default function OvertimePage() {
  const {
    currentUser,
    employees,
    overtimeRequests,
    addOvertimeRequest,
    updateOvertimeRequestStatus,
    deleteOvertimeRequest,
    punchRecords,
    compLeaveLedger,
    getCompLeaveBalance,
    grantCompLeaveHours,
  } = useApp();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ date: "", startTime: "", endTime: "", reason: "", compensationType: "pay" as "pay" | "time_off" });

  useEffect(() => {
    const date = searchParams.get("date");
    const reason = searchParams.get("reason");
    if (date || reason) {
      setFormData(prev => ({
        ...prev,
        date: date || prev.date,
        reason: reason || prev.reason
      }));
      setShowForm(true);
    }
  }, [searchParams]);
  const [rejectModal, setRejectModal] = useState<{ id: string; reason: string } | null>(null);
  const [grantForm, setGrantForm] = useState({
    employeeId: "",
    hours: "",
    note: "",
  });
  const [isGranting, setIsGranting] = useState(false);

  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";
  const staffEmployees = useMemo(
    () => employees.filter((e) => e.role !== "owner"),
    [employees]
  );

  const adjustmentHistory = useMemo(
    () =>
      compLeaveLedger
        .filter((entry) => entry.sourceType === "adjustment")
        .slice(0, 20),
    [compLeaveLedger]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      await addOvertimeRequest({
        employeeId: currentUser.id,
        employeeName: currentUser.name,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        reason: formData.reason,
        compensationType: formData.compensationType,
        status: "pending",
      });
      setFormData({ date: "", startTime: "", endTime: "", reason: "", compensationType: "pay" });
      setShowForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "申請失敗");
    }
  };

  const calcHours = (s: string, e: string) => {
    if (!s || !e) return 0;
    const [sh, sm] = s.split(":").map(Number);
    const [eh, em] = e.split(":").map(Number);
    const h = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    return Math.round(h * 100) / 100;
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending:  { label: "待審核", color: "bg-yellow-100 text-yellow-800" },
    approved: { label: "已核准", color: "bg-green-100 text-green-800" },
    rejected: { label: "已駁回", color: "bg-red-100 text-red-800" },
  };

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name ?? id;

  const visibleRequests = isManager
    ? overtimeRequests
    : overtimeRequests.filter(r => r.employeeId === currentUser?.id);

  const handleGrantCompLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantForm.employeeId || isGranting) return;
    const hours = Number(grantForm.hours);
    if (!Number.isFinite(hours) || hours === 0) {
      alert("請輸入有效的時數（可為正數核發、負數扣回）");
      return;
    }

    setIsGranting(true);
    try {
      await grantCompLeaveHours(grantForm.employeeId, hours, grantForm.note);
      setGrantForm({ employeeId: "", hours: "", note: "" });
      alert(hours > 0 ? "補休時數已核發" : "補休時數已扣回");
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setIsGranting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">加班申請</h2>
        {currentUser?.role !== "owner" && (
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">新申請</button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-medium text-gray-900 mb-4">新加班申請</h3>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
              <input type="date" value={formData.date} min={currentMonthMinDate()} onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始時間</label>
                <input type="time" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">結束時間</label>
                <input type="time" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg" required />
              </div>
            </div>
            {formData.startTime && formData.endTime && (
              <p className="text-xs text-gray-500">預估加班：{calcHours(formData.startTime, formData.endTime)} 小時</p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">加班原因</label>
              <textarea value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg" rows={3} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">補償方式</label>
              <div className="flex gap-4">
                {[{ v: "pay", l: "加班費" }, { v: "time_off", l: "補休" }].map(opt => (
                  <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="comp" value={opt.v}
                      checked={formData.compensationType === opt.v}
                      onChange={() => setFormData({ ...formData, compensationType: opt.v as "pay" | "time_off" })} />
                    <span>{opt.l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">送出</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">取消</button>
            </div>
          </form>
        </div>
      )}

      {isManager && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b bg-emerald-50">
            <h3 className="font-medium text-gray-900">補休時數管理</h3>
            <p className="text-xs text-gray-600 mt-1">
              店長／老闆可手動核發或扣回員工補休時數（半年內有效，與加班轉補休相同）
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
                      {emp.name}（可用 {getCompLeaveBalance(emp.id)} 小時）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">時數</label>
                <input
                  type="number"
                  step="0.5"
                  value={grantForm.hours}
                  onChange={(e) => setGrantForm((prev) => ({ ...prev, hours: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="例如：2 或 -1（扣回）"
                  required
                />
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
                    <span className="font-semibold text-emerald-700">
                      {getCompLeaveBalance(emp.id)} 小時
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {adjustmentHistory.length > 0 && (
            <div className="border-t p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">近期手動調整紀錄</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left py-1 pr-2">時間</th>
                      <th className="text-left py-1 pr-2">員工</th>
                      <th className="text-left py-1 pr-2">時數</th>
                      <th className="text-left py-1">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustmentHistory.map((entry) => (
                      <tr key={entry.id} className="border-t">
                        <td className="py-1.5 pr-2 text-gray-600">
                          {new Date(entry.createdAt).toLocaleDateString("zh-TW")}
                        </td>
                        <td className="py-1.5 pr-2">
                          {employees.find((e) => e.id === entry.employeeId)?.name ?? "—"}
                        </td>
                        <td className={`py-1.5 pr-2 font-medium ${entry.hours > 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {entry.hours > 0 ? "+" : ""}
                          {entry.hours} 小時
                        </td>
                        <td className="py-1.5 text-gray-600">{entry.note ?? SOURCE_LABELS.adjustment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">加班申請記錄</h3>
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
                <tr><td colSpan={9} className="p-8 text-center text-gray-500">沒有加班申請記錄</td></tr>
              )}
              {visibleRequests.map(req => {
                const st = statusLabels[req.status];
                const h = calcHours(req.startTime, req.endTime);
                const empName = req.employeeName || getEmpName(req.employeeId);
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{empName}</td>
                    <td className="px-4 py-3 text-gray-600">{req.date}</td>
                    <td className="px-4 py-3 text-gray-600">{req.startTime} - {req.endTime}</td>
                    <td className="px-4 py-3 text-gray-600">{h} 小時</td>
                    <td className="px-4 py-3 text-gray-600">{req.reason}</td>
                    <td className="px-4 py-3 text-gray-600">{req.compensationType === "pay" ? "加班費" : "補休"}</td>
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
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
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
                              <button onClick={() => updateOvertimeRequestStatus(req.id, "approved")}
                                className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">核准</button>
                              <button onClick={() => setRejectModal({ id: req.id, reason: "" })}
                                className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600">駁回</button>
                            </>
                          )}
                          {req.status !== "pending" && (
                            <button onClick={() => updateOvertimeRequestStatus(req.id, "pending" as "approved")}
                              className="px-2 py-1 border rounded text-xs hover:bg-gray-50">取消審核</button>
                          )}
                          <button onClick={async () => {
                              if (!confirm("確定刪除？")) return;
                              try {
                                await deleteOvertimeRequest(req.id);
                              } catch (error) {
                                console.error(error);
                                alert('刪除失敗，請稍後再試。');
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
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-3">填寫駁回原因</h3>
            <textarea value={rejectModal.reason}
              onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3" rows={3} placeholder="請輸入駁回原因（選填）" />
            <div className="flex gap-2">
              <button onClick={async () => { await updateOvertimeRequestStatus(rejectModal.id, "rejected", rejectModal.reason); setRejectModal(null); }}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">確認駁回</button>
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2 border rounded-lg text-sm">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
