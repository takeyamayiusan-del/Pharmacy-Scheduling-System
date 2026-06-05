"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/lib/context/AppContext";

export default function OvertimePage() {
  const { currentUser, employees, overtimeRequests, addOvertimeRequest, updateOvertimeRequestStatus, deleteOvertimeRequest, punchRecords } = useApp();
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

  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    addOvertimeRequest({
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
              <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })}
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
                          <button onClick={() => { if (confirm("確定刪除？")) deleteOvertimeRequest(req.id); }}
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
