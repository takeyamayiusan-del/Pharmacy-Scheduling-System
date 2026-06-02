"use client";

import { useState } from "react";
import { useApp } from "@/lib/context/AppContext";

export default function WednesdayShiftsPage() {
  const { 
    currentUser, 
    employees,
    wednesdayNightShifts, 
    setWednesdayNightShift
  } = useApp();
  
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1));
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  
  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";
  const isYihsiao = currentUser?.id === "yihsiao";
  const isZhenting = currentUser?.id === "zhenting";
  const canEdit = canManage || isYihsiao || isZhenting;
  
  // 取得本月的所有禮拜三
  const getWednesdays = () => {
    const wednesdays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const date = new Date(dateStr);
      if (date.getDay() === 3) {
        wednesdays.push({ day, dateStr });
      }
    }
    return wednesdays;
  };
  
  const wednesdays = getWednesdays();
  
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };
  
  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 border rounded hover:bg-gray-100">
            ◀
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{year}年{month}月 禮拜三晚班輪流</h1>
          <button onClick={nextMonth} className="p-2 border rounded hover:bg-gray-100">
            ▶
          </button>
        </div>
      </div>
      
      {/* 說明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2">📋 說明</h3>
        <p className="text-sm text-gray-700">
          宜孝和貞葶每個月的禮拜三輪流上晚班。
        </p>
        {canEdit && (
          <p className="text-sm text-green-600 mt-1">
            ✅ 您可以設定自己的晚班日期
          </p>
        )}
      </div>
      
      {/* 禮拜三列表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">本月禮拜三</h3>
          <div className="grid gap-3">
            {wednesdays.map(({ day, dateStr }) => {
              const shift = wednesdayNightShifts.find(s => s.date === dateStr);
              const assignedEmp = shift ? employees.find(e => e.id === shift.employeeId) : null;
              
              return (
                <div key={dateStr} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-lg">{month}月{day}日</span>
                    <span className="text-gray-500">(禮拜三)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {canEdit ? (
                      <select
                        value={shift?.employeeId || ""}
                        onChange={(e) => setWednesdayNightShift(dateStr, e.target.value)}
                        className="border rounded-lg px-4 py-2"
                      >
                        <option value="">請選擇</option>
                        <option value="yihsiao">宜孝</option>
                        <option value="zhenting">貞葶</option>
                      </select>
                    ) : (
                      <span className={`font-medium px-3 py-1 rounded-full ${
                        assignedEmp?.id === "yihsiao" ? "bg-blue-100 text-blue-800" :
                        assignedEmp?.id === "zhenting" ? "bg-green-100 text-green-800" :
                        "bg-gray-200 text-gray-600"
                      }`}>
                        {assignedEmp?.name || "未設定"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
