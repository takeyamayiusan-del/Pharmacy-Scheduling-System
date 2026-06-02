"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { useSearchParams } from "next/navigation";

export default function ShiftSwapPage() {
  const { currentUser, employees, swapRequests, addSwapRequest, updateSwapRequestStatus } = useApp();
  const searchParams = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: "",
    targetEmployeeId: ""
  });

  const source = searchParams.get("source");
  const sourceNote = searchParams.get("source_note");

  useEffect(() => {
    const date = searchParams.get("date");
    const targetEmployeeId = searchParams.get("targetEmployeeId");
    if (!date && !targetEmployeeId) return;
    setShowForm(true);
    setFormData((prev) => ({
      date: date || prev.date,
      targetEmployeeId: targetEmployeeId || prev.targetEmployeeId,
    }));
  }, [searchParams]);
  
  // 提交換班申請
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    
    const targetEmployee = employees.find(e => e.id === formData.targetEmployeeId);
    if (!targetEmployee) return;
    
    addSwapRequest({
      requesterId: currentUser.id,
      requesterName: currentUser.name,
      targetEmployeeId: targetEmployee.id,
      targetEmployeeName: targetEmployee.name,
      date: formData.date,
      status: "pending_confirmation"
    });
    
    setFormData({ date: "", targetEmployeeId: "" });
    setShowForm(false);
    alert("換班申請已送出！");
  };
  
  // 應對換班請求（確認/拒絕）
  const handleRespond = (id: string, accept: boolean) => {
    if (accept) {
      updateSwapRequestStatus(id, "pending_approval");
    } else {
      updateSwapRequestStatus(id, "rejected");
    }
  };
  
  // 管理者審核
  const handleApprove = (id: string, approve: boolean) => {
    updateSwapRequestStatus(id, approve ? "approved" : "rejected");
  };
  
  // 狀態顯示
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending_confirmation": return "等待對方確認";
      case "pending_approval": return "等待管理者審核";
      case "approved": return "已核准";
      case "rejected": return "已拒絕";
      default: return status;
    }
  };
  
  const getStatusClass = (status: string) => {
    switch (status) {
      case "pending_confirmation": return "bg-yellow-100 text-yellow-800";
      case "pending_approval": return "bg-blue-100 text-blue-800";
      case "approved": return "bg-green-100 text-green-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };
  
  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">換班申請</h2>
        {currentUser?.role !== "owner" && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            新申請
          </button>
        )}
      </div>
      
      {/* 說明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2">換班流程</h3>
        <p className="text-sm text-gray-700">
          1. 發起換班申請 → 2. 對方確認 → 3. 管理者審核 → 4. 完成
        </p>
      </div>

      {source === "wednesday_conflict" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            {sourceNote || "由禮三晚班衝突引導建立換班申請"}
          </p>
        </div>
      )}
      
      {/* 新申請表單 */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-medium text-gray-900 mb-4">新換班申請</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日期
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                換班對象
              </label>
              <select
                  value={formData.targetEmployeeId}
                  onChange={e => setFormData({ ...formData, targetEmployeeId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                >
                  <option value="">請選擇</option>
                  {employees.filter(e => e.id !== currentUser?.id && e.role !== "owner").map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                送出申請
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* 換班申請列表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">換班申請記錄</h3>
        </div>
        <div className="divide-y">
          {swapRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              沒有換班申請記錄
            </div>
          ) : (
            swapRequests.map(req => {
              const isTarget = currentUser?.id === req.targetEmployeeId;
              const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";
              
              return (
                <div key={req.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {req.requesterName} ↔ {req.targetEmployeeName}
                      </p>
                      <p className="text-sm text-gray-600">日期：{req.date}</p>
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${getStatusClass(req.status)}`}>
                        {getStatusLabel(req.status)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {/* 對方可以確認/拒絕 */}
                      {isTarget && req.status === "pending_confirmation" && (
                        <>
                          <button
                            onClick={() => handleRespond(req.id, true)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            確認
                          </button>
                          <button
                            onClick={() => handleRespond(req.id, false)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            拒絕
                          </button>
                        </>
                      )}
                      {/* 管理者可以審核 */}
                      {isManager && req.status === "pending_approval" && (
                        <>
                          <button
                            onClick={() => handleApprove(req.id, true)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            核准
                          </button>
                          <button
                            onClick={() => handleApprove(req.id, false)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            駁回
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
