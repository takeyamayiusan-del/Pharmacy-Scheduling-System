"use client";

import { useState } from "react";
import { useApp } from "@/lib/context/AppContext";

export default function LeaveSelectionPage() {
  const { 
    currentUser, 
    isSunday, 
    isSaturday, 
    isWednesday,
    countSaturdaysInMonth,
    getHolidayInfo
  } = useApp();
  
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1));
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const saturdayCount = countSaturdaysInMonth(year, month);
  
  // 取得本月的所有禮拜六
  const getSaturdays = () => {
    const saturdays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (isSaturday(dateStr)) {
        saturdays.push({ day, dateStr });
      }
    }
    return saturdays;
  };
  
  const saturdays = getSaturdays();
  
  // 計算員工剩餘可選休假天數
  const getRemainingDays = () => {
    if (!currentUser) return { weekend: 0, weekday: 0, optional: 0 };
    if (currentUser.id === "shengwen") {
      // 聖文只能選2天禮拜六
      const selectedWeekends = selectedDates.filter(dt => {
        const dtObj = new Date(dt);
        return dtObj.getDay() === 6;
      }).length;
      return { weekend: 2 - selectedWeekends, weekday: 0, optional: 0 };
    } else {
      const selectedWeekends = selectedDates.filter(dt => {
        const dtObj = new Date(dt);
        return dtObj.getDay() === 6;
      }).length;
      const selectedWeekdays = selectedDates.length - selectedWeekends;
      
      // 計算是否有第5個禮拜六被選
      const fifthSaturday = saturdays[4];
      const hasSelectedFifth = fifthSaturday && selectedDates.includes(fifthSaturday.dateStr);
      
      return { 
        weekend: 2 - selectedWeekends + (hasSelectedFifth ? 1 : 0), // 如果已選第5個，不計入基本配額
        weekday: 2 - selectedWeekdays,
        optional: saturdayCount >= 5 ? 1 : 0 
      };
    }
  };
  
  const remaining = getRemainingDays();
  
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };
  
  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };
  
  // 切換日期選擇
  const toggleDate = (day: number) => {
    if (!currentUser) return;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // 檢查是否可以選擇這個日期
    if (!canSelectDate(day)) return;
    
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(selectedDates.filter(dt => dt !== dateStr));
    } else {
      setSelectedDates([...selectedDates, dateStr]);
    }
  };
  
  // 檢查是否可以選擇這個日期
  const canSelectDate = (day: number) => {
    if (!currentUser) return false;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(dateStr);
    
    // 禮拜日不能選
    if (isSunday(dateStr)) return false;
    
    // 檢查是否是第5個禮拜六
    const isFifthSaturday = saturdays[4]?.day === day;
    
    // 聖文的特殊規則
    if (currentUser.id === "shengwen") {
      // 禮拜三不能選
      if (isWednesday(dateStr)) return false;
      // 只能選禮拜六
      if (dateObj.getDay() !== 6) return false;
      // 最多2天
      const selectedWeekends = selectedDates.filter(dt => {
        const dtObj = new Date(dt);
        return dtObj.getDay() === 6;
      }).length;
      
      // 第5個禮拜六是可選的，但不算入基本配額
      if (isFifthSaturday) {
        return true; // 永遠可以選擇第5個禮拜六
      }
      
      if (selectedWeekends >= 2 && !selectedDates.includes(dateStr)) return false;
    } else {
      // 其他員工的規則
      const isSat = isSaturday(dateStr);
      const selectedWeekends = selectedDates.filter(dt => {
        const dtObj = new Date(dt);
        return dtObj.getDay() === 6;
      }).length;
      const selectedWeekdays = selectedDates.length - selectedWeekends;
      
      // 檢查是否已選第5個禮拜六
      const fifthSaturday = saturdays[4];
      const hasSelectedFifth = fifthSaturday && selectedDates.includes(fifthSaturday.dateStr);
      
      if (isSat) {
        if (isFifthSaturday) {
          // 第5個禮拜六永遠可以選擇
          return true;
        }
        // 基本2天配額
        if (selectedWeekends - (hasSelectedFifth ? 1 : 0) >= 2 && !selectedDates.includes(dateStr)) {
          return false;
        }
      } else {
        if (selectedWeekdays >= 2 && !selectedDates.includes(dateStr)) {
          return false;
        }
      }
    }
    
    return true;
  };
  
  // 檢查是否是第5個禮拜六
  const isFifthSaturday = (day: number) => {
    return saturdays[4]?.day === day;
  };
  
  // 提交排休
  const submitLeaveSelection = () => {
    if (selectedDates.length === 0) return;
    alert(`已成功選擇 ${selectedDates.length} 天排休！`);
  };
  
  return (
    <div className="space-y-6">
      {/* 頁頭 */}
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
      
      {/* 排休規則說明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-800 mb-2">📋 排休規則說明</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p>• 每月休假8天：4天固定禮拜日，4天可自行選擇</p>
          <p>• 可自行選擇的4天：2天禮拜六，2天平日</p>
          {saturdayCount >= 5 && (
            <p className="text-purple-600 font-medium">
              • ⚠️ 本月有5個禮拜六，第5個禮拜六可選擇是否排休（不計入基本配額）
            </p>
          )}
          {currentUser?.id === "shengwen" && (
            <p className="text-red-600 font-medium">
              • 聖文：禮拜二上午固定上班，禮拜三固定休息，只能選擇2天禮拜六
            </p>
          )}
        </div>
      </div>
      
      {/* 剩餘天數 */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <h3 className="font-medium text-gray-900 mb-3">剩餘可選天數</h3>
        <div className="flex flex-wrap gap-4">
          {currentUser?.id === "shengwen" ? (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full font-medium">
                禮拜六：{remaining.weekend}天
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full font-medium">
                  禮拜六：{remaining.weekend}天
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                  平日：{remaining.weekday}天
                </span>
              </div>
              {saturdayCount >= 5 && (
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full font-medium">
                    第5個禮拜六：可選
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* 日曆 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {/* 星期抬頭 */}
            {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
              <div
                key={i}
                className={`text-center font-medium py-2 ${i === 0 ? "text-red-600" : i === 6 ? "text-orange-600" : "text-gray-700"}`}
              >
                {d}
              </div>
            ))}
            
            {/* 日期 */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSun = isSunday(dateStr);
              const isSat = isSaturday(dateStr);
              const isFifthSat = isFifthSaturday(day);
              const canSelect = canSelectDate(day);
              const isSelected = selectedDates.includes(dateStr);
              const isShengwenRest = currentUser?.id === "shengwen" && isWednesday(dateStr);
              const holidayInfo = getHolidayInfo(dateStr);
              
              return (
                <div
                  key={day}
                  onClick={() => toggleDate(day)}
                  className={`
                    aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer relative
                    ${isSelected ? "bg-green-500 text-white" : "bg-gray-50 hover:bg-gray-100"}
                    ${isSun ? "bg-red-50 text-red-600" : ""}
                    ${isSat && !isSelected ? "bg-orange-50" : ""}
                    ${isFifthSat && !isSelected ? "border-2 border-purple-500" : ""}
                    ${isShengwenRest && !isSelected ? "bg-gray-300 text-gray-500 cursor-not-allowed" : ""}
                    ${!canSelect && !isSelected && !isSun ? "opacity-40 cursor-not-allowed" : ""}
                  `}
                >
                  <span className="font-medium">{day}</span>
                  {isSelected && <span className="text-xs">已選</span>}
                  {isSun && <span className="text-xs">固定</span>}
                  {isFifthSat && !isSelected && <span className="text-xs text-purple-600">第5</span>}
                  {isShengwenRest && !isSelected && <span className="text-xs">休息</span>}
                  {holidayInfo.isHoliday && !isSun && (
                    <div className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-800 text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                      國
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* 圖例 */}
        <div className="p-4 border-t bg-gray-50 flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="w-6 h-6 bg-green-500 rounded flex items-center justify-center text-white text-xs">選</span>
            已選擇
          </span>
          <span className="flex items-center gap-2">
            <span className="w-6 h-6 bg-red-50 rounded flex items-center justify-center text-red-600 text-xs">固</span>
            固定禮拜日
          </span>
          {saturdayCount >= 5 && (
            <span className="flex items-center gap-2">
              <span className="w-6 h-6 bg-orange-50 border-2 border-purple-500 rounded flex items-center justify-center text-orange-600 text-xs">5</span>
              第5個禮拜六
            </span>
          )}
        </div>
      </div>
      
      {/* 提交按鈕 */}
      <div className="flex justify-end">
        <button
          onClick={submitLeaveSelection}
          disabled={selectedDates.length === 0}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          確認提交排休 ({selectedDates.length}天)
        </button>
      </div>
    </div>
  );
}
