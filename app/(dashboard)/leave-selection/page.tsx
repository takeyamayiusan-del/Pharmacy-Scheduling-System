"use client";

import { useState } from "react";
import { useApp } from "@/lib/context/AppContext";

export default function LeaveSelectionPage() {
  const {
    currentUser,
    employees,
    isSunday,
    isSaturday,
    countSaturdaysInMonth,
    getHolidayInfo,
    getLeaveSummary,
    toggleLeaveDate,
    getShiftForDate,
    isLeaveMonthLocked,
  } = useApp();
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const saturdayCount = countSaturdaysInMonth(year, month);
  const leaveSummary = currentUser ? getLeaveSummary(currentUser.id, year, month) : null;
  const selectedDates = leaveSummary?.selectedDates ?? [];
  const monthLocked = isLeaveMonthLocked(year, month);
  const weekdayOffOnly = currentUser?.isWeekdayOffRule ?? false;

  const remaining = {
    weekend: Math.max(0, 2 - (leaveSummary?.saturdayUsed ?? 0)),
    weekday: Math.max(0, 2 - (leaveSummary?.weekdayUsed ?? 0)),
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const toggleDate = (day: number) => {
    if (!currentUser) return;
    if (monthLocked) {
      alert("本月份排休已鎖定，僅可選擇後續月份");
      return;
    }
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const result = toggleLeaveDate(currentUser.id, dateStr);
    if (!result.success && result.message) {
      alert(result.message);
    }
  };

  const canSelectDate = (day: number) => {
    if (!currentUser) return false;
    if (monthLocked) return false;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (selectedDates.includes(dateStr)) return true;
    if (isSunday(dateStr)) return false;
    if (isSaturday(dateStr)) {
      return (leaveSummary?.saturdayUsed ?? 0) < 2;
    }
    if (weekdayOffOnly) return false;
    return (leaveSummary?.weekdayUsed ?? 0) < 2;
  };

  const warnings = Array.from({ length: daysInMonth }, (_, index) => index + 1)
    .map((day) => {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isSunday(dateStr)) return null;
      const restingEmployees = employees
        .filter((emp) => emp.role !== "owner")
        .filter((emp) => getShiftForDate(dateStr, emp.id) === "X");
      const weekdayRestingEmployees = restingEmployees.filter(() => !isSaturday(dateStr));
      const aShiftEmployees = employees
        .filter((emp) => emp.role !== "owner")
        .filter((emp) => getShiftForDate(dateStr, emp.id) === "A");

      const messages: string[] = [];
      if (weekdayRestingEmployees.length > 1) {
        messages.push(`平日有多人排休：${weekdayRestingEmployees.map((emp) => emp.name).join("、")}`);
      }
      if (aShiftEmployees.length === 0) {
        messages.push("當天沒有人上 A 班");
      }
      if (messages.length === 0) return null;
      return { dateStr, day, messages };
    })
    .filter(Boolean) as { dateStr: string; day: number; messages: string[] }[];

  return (
    <div className="space-y-6">
      {monthLocked && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-medium text-red-700">
            本月份排休已由店長鎖定，請改選後續月份。
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="p-2 border rounded hover:bg-gray-100">
            ◀
          </button>
          <h2 className="text-2xl font-bold text-gray-900">{year}年{month}月 排休選擇</h2>
          <button onClick={nextMonth} className="p-2 border rounded hover:bg-gray-100">
            ▶
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2">📋 排休規則說明</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p>• 每月休假 8 天：4 天固定禮拜日，2 天禮拜六，2 天平日</p>
          <p>• 平常大家預設都是 B 班，A 班代表全天＋晚班</p>
          <p>• 點選日期後會<strong>立即儲存</strong>，無需另外提交</p>
          {saturdayCount >= 5 && (
            <p className="text-purple-600 font-medium">
              • 本月有 5 個禮拜六，但每人仍最多只能排休 2 天禮拜六
            </p>
          )}
          {weekdayOffOnly && (
            <p className="text-purple-600 font-medium">
              • 您套用「平日不排休」規則，排休只能選擇禮拜六（請至固定班表由店長設定）
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-medium text-gray-900 mb-3">剩餘可選天數</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full font-medium">
              禮拜六：{remaining.weekend}天
            </span>
          </div>
          {!weekdayOffOnly && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                平日：{remaining.weekday}天
              </span>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-3">
          目前已選 {selectedDates.length} 天
          {monthLocked ? "（本月已鎖定）" : ""}
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-medium text-amber-800 mb-2">⚠️ 排班提醒</h3>
          <div className="space-y-2 text-sm text-amber-900">
            {warnings.map((warning) => (
              <div key={warning.dateStr}>
                <span className="font-medium">{warning.day} 日：</span>
                {warning.messages.join("；")}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {["一", "二", "三", "四", "五", "六", "日"].map((d, i) => (
              <div
                key={i}
                className={`text-center font-medium py-2 ${i === 6 ? "text-red-600" : i === 5 ? "text-orange-600" : "text-gray-700"}`}
              >
                {d}
              </div>
            ))}

            {Array.from({ length: firstDayOffset }, (_, i) => (
              <div key={`empty-${i}`} className="aspect-square rounded-lg bg-transparent" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSun = isSunday(dateStr);
              const isSat = isSaturday(dateStr);
              const canSelect = canSelectDate(day);
              const isSelected = selectedDates.includes(dateStr);
              const holidayInfo = getHolidayInfo(dateStr);

              return (
                <div
                  key={day}
                  onClick={() => canSelect && toggleDate(day)}
                  className={`
                    aspect-square flex flex-col items-center justify-center rounded-lg relative
                    ${isSelected ? "bg-green-500 text-white cursor-pointer" : "bg-gray-50 hover:bg-gray-100"}
                    ${isSun ? "bg-red-50 text-red-600" : ""}
                    ${isSat && !isSelected ? "bg-orange-50" : ""}
                    ${!canSelect && !isSelected && !isSun ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <span className="font-medium">{day}</span>
                  {isSelected && <span className="text-xs">已選</span>}
                  {isSun && <span className="text-xs">固定</span>}
                  {holidayInfo.isHoliday && !isSun && (
                    <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-yellow-400 text-yellow-950 text-lg font-black leading-tight py-1 text-center border-t-2 border-amber-600 shadow-sm">
                      國定
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="w-6 h-6 bg-green-500 rounded flex items-center justify-center text-white text-xs">選</span>
            已選擇
          </span>
          <span className="flex items-center gap-2">
            <span className="w-6 h-6 bg-red-50 rounded flex items-center justify-center text-red-600 text-xs">固</span>
            固定禮拜日
          </span>
          <span className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-yellow-400 text-yellow-950 text-sm font-black rounded border-2 border-amber-600">國定</span>
            國定假日
          </span>
        </div>
      </div>
    </div>
  );
}
