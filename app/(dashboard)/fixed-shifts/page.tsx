"use client";

import { useState } from "react";
import { useApp, type ShiftType } from "@/lib/context/AppContext";

const shiftOptions: ShiftType[] = ["A", "B", "C", "D", "E", "X"];
const shiftLabels: Record<ShiftType, string> = {
  A: "全天",
  B: "白班",
  C: "下午",
  D: "晚班",
  E: "下午+晚",
  X: "休假"
};
const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export default function FixedShiftsPage() {
  const { 
    currentUser, 
    employees,
    fixedShifts, 
    addFixedShift, 
    updateFixedShift, 
    deleteFixedShift 
  } = useApp();
  
  const [newEmployeeId, setNewEmployeeId] = useState<string>("");
  const [newDayOfWeek, setNewDayOfWeek] = useState<number>(1);
  const [newShift, setNewShift] = useState<ShiftType>("B");
  
  // 只顯示員工（不包含老闆）
  const displayEmployees = employees.filter(e => e.role !== "owner");
  
  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";
  
  const handleAdd = () => {
    if (!newEmployeeId) return;
    addFixedShift({
      employeeId: newEmployeeId,
      dayOfWeek: newDayOfWeek,
      shift: newShift
    });
    // 重置
    setNewEmployeeId("");
  };
  
  const handleUpdate = (index: number, field: string, value: any) => {
    const updated = { ...fixedShifts[index] };
    if (field === "employeeId") updated.employeeId = value;
    if (field === "dayOfWeek") updated.dayOfWeek = value;
    if (field === "shift") updated.shift = value;
    updateFixedShift(index, updated);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">固定班表管理</h1>
        {!canManage && (
          <p className="text-gray-500 text-sm">您無權管理固定班表</p>
        )}
      </div>
      
      {/* 說明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2">📋 說明</h3>
        <p className="text-sm text-gray-700">
          在這裡可以設定每個員工每個星期幾固定上什麼班。
        </p>
      </div>
      
      {canManage && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-medium text-gray-900 mb-4">新增固定班表</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">員工</label>
              <select
                value={newEmployeeId}
                onChange={(e) => setNewEmployeeId(e.target.value)}
                className="border rounded-lg px-4 py-2"
              >
                <option value="">請選擇</option>
                {displayEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">星期</label>
              <select
                value={newDayOfWeek}
                onChange={(e) => setNewDayOfWeek(parseInt(e.target.value))}
                className="border rounded-lg px-4 py-2"
              >
                {[0, 1, 2, 3, 4, 5, 6].map(day => (
                  <option key={day} value={day}>{dayLabels[day]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">班別</label>
              <select
                value={newShift}
                onChange={(e) => setNewShift(e.target.value as ShiftType)}
                className="border rounded-lg px-4 py-2"
              >
                {shiftOptions.map(shift => (
                  <option key={shift} value={shift}>{shiftLabels[shift]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <button
                onClick={handleAdd}
                disabled={!newEmployeeId}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                新增
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 固定班表列表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">已設定的固定班表</h3>
          {fixedShifts.length === 0 ? (
            <p className="text-gray-500 text-center py-8">目前沒有設定任何固定班表</p>
          ) : (
            <div className="space-y-3">
              {fixedShifts.map((fs, index) => {
                const emp = employees.find(e => e.id === fs.employeeId);
                return (
                  <div key={index} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                    {canManage ? (
                      <>
                        <select
                          value={fs.employeeId}
                          onChange={(e) => handleUpdate(index, "employeeId", e.target.value)}
                          className="border rounded px-3 py-2"
                        >
                          {displayEmployees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                          ))}
                        </select>
                        <span className="text-gray-400">→</span>
                        <select
                          value={fs.dayOfWeek}
                          onChange={(e) => handleUpdate(index, "dayOfWeek", parseInt(e.target.value))}
                          className="border rounded px-3 py-2"
                        >
                          {[0, 1, 2, 3, 4, 5, 6].map(day => (
                            <option key={day} value={day}>{dayLabels[day]}</option>
                          ))}
                        </select>
                        <span className="text-gray-400">→</span>
                        <select
                          value={fs.shift}
                          onChange={(e) => handleUpdate(index, "shift", e.target.value)}
                          className="border rounded px-3 py-2"
                        >
                          {shiftOptions.map(shift => (
                            <option key={shift} value={shift}>{shiftLabels[shift]}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => deleteFixedShift(index)}
                          className="ml-auto text-red-600 hover:text-red-800"
                        >
                          刪除
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">{emp?.name}</span>
                        <span className="text-gray-400">→</span>
                        <span>{dayLabels[fs.dayOfWeek]}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-blue-600">{shiftLabels[fs.shift]}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>
  );
}
