"use client";

import { useState } from "react";
import { useApp } from "@/lib/context/AppContext";

export default function OvertimePage() {
  const { currentUser, overtimeRequests, addOvertimeRequest, updateOvertimeRequestStatus } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: "",
    startTime: "",
    endTime: "",
    reason: "",
    compensationType: "pay" as "pay" | "time_off"
  });
  
  // 提交加班申請
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
      status: "pending"
    });
    
    setFormData({
      date: "",
      startTime: "",
      endTime: "",
      reason: "",
      compensationType: "pay"
    });
    setShowForm(false);
    alert("加班申請已送出！");
  };
  
  // 管理者審核
  const handleApprove = (id: string, approve: boolean) => {
    updateOvertimeRequestStatus(id, approve ? "approved" : "rejected");
  };
  
  // 狀態顯示
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "待審核";
      case "approved": return "已核准";
      case "rejected": return "已駁回";
      default: return status;
    }
  };
  
  const getStatusClass = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "approved": return "bg-green-100 text-green-800";
      case "rejected": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };
  
  // 補償類型顯示
  const getCompensationLabel = (type: string) => {
    return type === "pay" ? "加班費" : "補休";
  };
  
  // 計算工時
  const calculateHours = (start: string, end: string) => {
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    return ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
  };
  
  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">加班申請</h2>
        {currentUser?.role !== "owner" && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            新申請
          </button>
        )}
      </div>
      
      {/* 新申請表單 */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-medium text-gray-900 mb-4">新加班申請</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    開始時間
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    結束時間
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                加班原因
              </label>
              <textarea
                value={formData.reason}
                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                補償方式
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="compensation"
                    value="pay"
                    checked={formData.compensationType === "pay"}
                    onChange={() => setFormData({ ...formData, compensationType: "pay" })}
                  />
                  <span>加班費</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="compensation"
                    value="time_off"
                    checked={formData.compensationType === "time_off"}
                    onChange={() => setFormData({ ...formData, compensationType: "time_off" })}
                  />
                  <span>補休</span>
                </label>
              </div>
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
      
      {/* 加班申請列表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">加班申請記錄</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">員工</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">日期</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">時間</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">工時</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">原因</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">補償方式</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">狀態</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">動作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {overtimeRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    沒有加班申請記錄
                  </td>
                </tr>
              ) : (
                overtimeRequests.map(req => {
                  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";
                  const hours = calculateHours(req.startTime, req.endTime);
                  
                  return (
                    <tr key={req.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {req.employeeName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {req.date}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {req.startTime} - {req.endTime}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {hours}小時
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {req.reason}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {getCompensationLabel(req.compensationType)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(req.status)}`}>
                          {getStatusLabel(req.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isManager && req.status === "pending" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(req.id, true)}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                            >
                              核准
                            </button>
                            <button
                              onClick={() => handleApprove(req.id, false)}
                              className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            >
                              駁回
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
