"use client";

import { useState } from "react";
import { useApp, type ShiftType, TAIWAN_HOLIDAYS_2026 } from "@/lib/context/AppContext";

// 班別顏色設定
const shiftColors: Record<ShiftType, { bg: string; text: string; border: string }> = {
  A: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  B: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  C: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  D: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
  E: { bg: "bg-pink-100", text: "text-pink-800", border: "border-pink-300" },
  X: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-300" },
};

const shiftLabels: Record<ShiftType, string> = {
  A: "全天",
  B: "白班",
  C: "下午",
  D: "晚班",
  E: "下午+晚",
  X: "休假",
};

const shiftOptions: ShiftType[] = ["A", "B", "C", "D", "E", "X"];

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export default function SchedulePage() {
  const { 
    currentUser, 
    employees,
    schedule, 
    updateShift, 
    isSunday, 
    isSaturday,
    isWednesday,
    getHolidayInfo,
    fixedShifts,
    wednesdayNightShifts,
    countSaturdaysInMonth,
  } = useApp();
  
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1));
  const [editingCell, setEditingCell] = useState<{ date: string; employeeId: string } | null>(null);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const saturdayCount = countSaturdaysInMonth(year, month);
  
  // 過濾掉老闆（不顯示在班表）
  const displayEmployees = employees.filter(e => e.role !== "owner");

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  // 檢查是否可以編輯
  const canEdit = (employeeId: string, dateStr: string): boolean => {
    if (!currentUser) return false;
    if (isSunday(dateStr)) return false; // 禮拜日不能編輯
    if (currentUser.role === "owner") return true; // 老闆可以編輯所有人
    if (currentUser.role === "manager" && currentUser.id === employeeId) return true; // 店長可以編輯自己的
    return false;
  };

  // 開始編輯
  const startEditing = (date: string, employeeId: string) => {
    if (canEdit(employeeId, date)) {
      setEditingCell({ date, employeeId });
    }
  };

  // 選擇班別
  const selectShift = (date: string, employeeId: string, shift: ShiftType) => {
    updateShift(date, employeeId, shift);
    setEditingCell(null);
  };

  // 班表單元格
  const ShiftCell = ({ date, employeeId, shift }: { date: string; employeeId: string; shift: ShiftType }) => {
    const colors = shiftColors[shift];
    const isEditing = editingCell?.date === date && editingCell?.employeeId === employeeId;
    const editable = canEdit(employeeId, date);
    const holidayInfo = getHolidayInfo(date);
    const isSun = isSunday(date);
    const isWed = isWednesday(date);
    
    // 檢查是否是禮拜三晚班輪流
    const wednesdayNightShift = wednesdayNightShifts.find(s => s.date === date && s.employeeId === employeeId);
    
    // 檢查是否有固定班表
    const dayOfWeek = new Date(date).getDay();
    const hasFixedShift = fixedShifts.some(f => f.employeeId === employeeId && f.dayOfWeek === dayOfWeek);

    if (isEditing) {
      return (
        <div className="p-1">
          <div className="flex flex-col gap-1">
            {shiftOptions.map((s) => (
              <button
                key={s}
                onClick={() => selectShift(date, employeeId, s)}
                className={`text-xs px-1 py-0.5 rounded border ${shiftColors[s].bg} ${shiftColors[s].text} ${shiftColors[s].border} hover:opacity-80`}
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => setEditingCell(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              取消
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="p-1 relative">
        <div
          onClick={() => editable && startEditing(date, employeeId)}
          className={`h-10 flex items-center justify-center rounded font-medium border-2 ${colors.bg} ${colors.text} ${colors.border} ${editable ? 'cursor-pointer hover:opacity-80' : ''} ${isSun ? 'bg-red-50' : ''} ${hasFixedShift ? 'ring-2 ring-orange-400' : ''}`}
        >
          {shift}
          {editable && <span className="ml-1 text-[10px]">✏️</span>}
        </div>
        
        {/* 標記 */}
        {isSun && shift === "X" && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            日
          </div>
        )}
        {!isSun && holidayInfo.isHoliday && (
          <div className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            國
          </div>
        )}
        {wednesdayNightShift && (
          <div className="absolute -bottom-1 -right-1 bg-pink-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            晚
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 頁頭 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 border rounded hover:bg-gray-100">
            ◀
          </button>
          <h2 className="text-2xl font-bold text-gray-900">{year}年{month}月 班表</h2>
          <button onClick={nextMonth} className="p-2 border rounded hover:bg-gray-100">
            ▶
          </button>
        </div>
        <div className="text-sm text-gray-600">
          {currentUser?.role === "owner" && <span className="text-blue-600">👑 您可以編輯所有人的班表</span>}
          {currentUser?.role === "manager" && <span className="text-green-600">👔 您可以編輯自己的班表</span>}
          {currentUser?.role === "staff" && <span className="text-gray-500">👤 僅檢視班表</span>}
        </div>
      </div>

      {/* 說明區 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-3">📋 說明</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="text-gray-600">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-orange-400"></div>
              <span>橘色框 - 固定班表</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span>禮拜日 - 不可編輯</span>
            </div>
          </div>
          <div className="text-gray-600">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span>國定假日 - 可編輯</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-pink-500"></div>
              <span>禮拜三晚班輪流</span>
            </div>
          </div>
        </div>
      </div>

      {/* 員工固定班表說明 */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-medium text-gray-900 mb-3">📅 固定班表</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {fixedShifts.map((fs, idx) => {
            const emp = employees.find(e => e.id === fs.employeeId);
            return (
              <div key={idx} className="border rounded-lg p-2">
                <span className="font-medium text-gray-800">{emp?.name}</span>
                <p className="text-gray-600 text-xs mt-1">
                  每個 {dayLabels[fs.dayOfWeek]} - {shiftLabels[fs.shift]}
                </p>
              </div>
            );
          })}
          {fixedShifts.length === 0 && (
            <p className="text-gray-500">尚無固定班表設定</p>
          )}
        </div>
      </div>

      {/* 禮拜三輪流晚班 */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-medium text-gray-900 mb-3">🌙 禮拜三晚班輪流 (宜孝/貞葶)</h3>
        <div className="flex flex-wrap gap-2">
          {wednesdayNightShifts
            .filter(s => new Date(s.date).getMonth() + 1 === month && new Date(s.date).getFullYear() === year)
            .map((s) => {
              const emp = employees.find(e => e.id === s.employeeId);
              const date = new Date(s.date);
              return (
                <div key={s.date} className="border rounded-lg p-2 bg-pink-50">
                  <div className="text-sm font-medium">{date.getMonth() + 1}/{date.getDate()}</div>
                  <div className="text-xs text-gray-600">{emp?.name}</div>
                </div>
              );
            })}
        </div>
      </div>

      {/* 本月資訊 */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-medium text-gray-900 mb-3">📊 本月資訊</h3>
        <div className="text-sm text-gray-600">
          <p>本月有 {saturdayCount} 個禮拜六</p>
          {saturdayCount >= 5 && (
            <p className="text-purple-600 font-medium mt-1">
              ⚠️ 第5個禮拜六 - 員工可選擇是否排休
            </p>
          )}
        </div>
      </div>

      {/* 班表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-3 text-left text-sm font-medium text-gray-700 sticky left-0 bg-gray-50 z-10 w-24">
                  員工
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const date = new Date(dateStr);
                  const dayOfWeek = date.getDay();
                  const holidayInfo = getHolidayInfo(dateStr);
                  
                  let headerClass = "";
                  if (dayOfWeek === 0) headerClass = "text-red-600 bg-red-50";
                  else if (dayOfWeek === 6) headerClass = "text-orange-600 bg-orange-50";
                  else if (holidayInfo.isHoliday) headerClass = "text-yellow-700 bg-yellow-50";
                  
                  return (
                    <th
                      key={day}
                      className={`p-2 text-center text-sm font-medium min-w-[48px] ${headerClass}`}
                    >
                      <div>{day}</div>
                      <div className="text-xs text-gray-500">{dayLabels[dayOfWeek]}</div>
                      {holidayInfo.isHoliday && !isSunday(dateStr) && (
                        <div className="text-[10px] text-yellow-700">{holidayInfo.name}</div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="p-3 text-left font-medium text-gray-900 sticky left-0 bg-white z-10 border-r">
                    {emp.name}
                    {emp.role === "manager" && (
                      <span className="text-xs text-blue-600 ml-1">(店長)</span>
                    )}
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const shift = schedule[dateStr]?.[emp.id] || "B";
                    return (
                      <td key={day} className={isSunday(dateStr) ? 'bg-red-50/30' : ''}>
                        <ShiftCell date={dateStr} employeeId={emp.id} shift={shift} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 圖例 */}
        <div className="p-4 border-t bg-gray-50">
          <div className="flex flex-wrap items-center gap-6">
            <span className="text-sm font-medium text-gray-700">圖例：</span>
            {Object.entries(shiftLabels).map(([shift, label]) => {
              const s = shift as ShiftType;
              const colors = shiftColors[s];
              return (
                <span key={shift} className="flex items-center gap-2 text-sm">
                  <span className={`w-8 h-8 flex items-center justify-center rounded border-2 font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
                    {s}
                  </span>
                  <span className="text-gray-600">{label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
