"use client";

import { useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { useRouter } from "next/navigation";

export default function WednesdayShiftsPage() {
  const router = useRouter();
  const { 
    currentUser, 
    wednesdayNightShifts, 
    setWednesdayNightShift,
    getWednesdayOffDates,
    toggleWednesdayOff,
    isWednesdayOff,
  } = useApp();
  
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1));
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  
  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";
  const isYihsiao = currentUser?.id === "yihsiao";
  const isZhenting = currentUser?.id === "zhenting";
  const isParticipant = isYihsiao || isZhenting;
  const yihsiaoOffDates = getWednesdayOffDates("yihsiao", year, month);
  const zhentingOffDates = getWednesdayOffDates("zhenting", year, month);
  const selfId = isYihsiao ? "yihsiao" : isZhenting ? "zhenting" : null;
  const peerId = isYihsiao ? "zhenting" : isZhenting ? "yihsiao" : null;
  
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

  const handleToggleWednesdayOff = (employeeId: "yihsiao" | "zhenting", dateStr: string) => {
    const selfId = currentUser?.id;
    const canTriggerConflictFlow = selfId === "yihsiao" || selfId === "zhenting";
    const selfAlreadyOff = selfId ? isWednesdayOff(selfId, dateStr) : false;
    const peerId = selfId === "yihsiao" ? "zhenting" : selfId === "zhenting" ? "yihsiao" : null;
    const peerOff = peerId ? isWednesdayOff(peerId, dateStr) : false;

    // 任一參與者在「準備新增不輪晚班」且對方已選時，直接導向換班申請
    if (canTriggerConflictFlow && employeeId === selfId && !selfAlreadyOff && peerOff && peerId) {
      const shouldNavigateToSwap = window.confirm(
        "這天已與對方衝突，是否現在提出換班申請？"
      );
      if (shouldNavigateToSwap) {
        const params = new URLSearchParams({
          date: dateStr,
          targetEmployeeId: peerId,
          source: "wednesday_conflict",
          source_note: "由禮三晚班衝突引導建立",
        });
        router.push(`/applications/shift-swap?${params.toString()}`);
        return;
      }
    }

    const result = toggleWednesdayOff(employeeId, dateStr);
    if (!result.success && result.message) {
      alert(result.message);
    }
  };
  
  if (!canManage && !isParticipant) {
    return (
      <div className="space-y-4">
        <div className="app-card p-6">
          <h1 className="text-2xl app-title">禮拜三晚班輪流</h1>
          <p className="app-subtitle mt-2">
            此功能僅開放宜孝與貞葶使用（店長/老闆可檢視）。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="app-btn-outline">
            ◀
          </button>
          <h1 className="text-2xl app-title">{year}年{month}月 禮拜三晚班輪流</h1>
          <button onClick={nextMonth} className="app-btn-outline">
            ▶
          </button>
        </div>
      </div>
      
      {/* 說明 */}
      <div className="app-card bg-gradient-to-r from-sky-50 to-emerald-50 border-sky-200 p-4">
        <h3 className="font-medium text-sky-800 mb-2">🧭 操作說明</h3>
        <div className="text-sm text-slate-700 space-y-1">
          <p>每月最多可選 2 個禮拜三「不輪晚班」。</p>
          <p>系統會顯示對方是否已選，若衝突再引導提出換班申請。</p>
        </div>
      </div>

      {isParticipant && selfId && peerId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="app-card p-4">
            <h3 className="font-medium text-gray-900 mb-2">🙋 你本月已選</h3>
            <p className="text-sm text-gray-600">
              {(selfId === "yihsiao" ? yihsiaoOffDates : zhentingOffDates).length}/2 天
            </p>
          </div>
          <div className="app-card p-4">
            <h3 className="font-medium text-gray-900 mb-2">👀 對方目前狀態</h3>
            <p className="text-sm text-gray-600">
              {(peerId === "yihsiao" ? yihsiaoOffDates : zhentingOffDates).length}/2 天已選
            </p>
          </div>
        </div>
      )}
      
      {/* 禮拜三列表 */}
      <div className="app-card overflow-hidden">
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">本月禮拜三</h3>
          <div className="grid gap-3">
            {wednesdays.map(({ day, dateStr }) => {
              const shift = wednesdayNightShifts.find(s => s.date === dateStr);
              const yihsiaoOff = isWednesdayOff("yihsiao", dateStr);
              const zhentingOff = isWednesdayOff("zhenting", dateStr);
              const canSetYihsiaoOff = isYihsiao;
              const canSetZhentingOff = isZhenting;
              const peerOff = peerId === "yihsiao" ? yihsiaoOff : peerId === "zhenting" ? zhentingOff : false;
              const participantAssignedName =
                yihsiaoOff && !zhentingOff
                  ? "貞葶"
                  : zhentingOff && !yihsiaoOff
                    ? "宜孝"
                    : null;
              const isConflict = yihsiaoOff && zhentingOff;
              
              return (
                <div key={dateStr} className="p-4 bg-slate-50 rounded-xl space-y-3 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-lg">{month}月{day}日</span>
                      <span className="text-gray-500">(禮拜三)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {canManage ? (
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
                        participantAssignedName && (
                          <span className={`font-medium px-3 py-1 rounded-full ${
                            participantAssignedName === "宜孝"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}>
                            {participantAssignedName}
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {isParticipant ? (
                    <div className="grid gap-3">
                      <div className="border rounded-lg bg-white p-3 flex items-center justify-between">
                        <span className="text-sm text-gray-600">對方狀態</span>
                        <span className={`text-sm ${peerOff ? "text-red-600" : "text-gray-500"}`}>
                          {peerOff ? "已選不輪晚班" : "尚未選擇"}
                        </span>
                      </div>
                      {!participantAssignedName && (
                        <div className="border rounded-lg bg-white p-3 flex items-center justify-between">
                          <span className="text-sm text-gray-600">本日晚班</span>
                          <span className={`text-sm ${isConflict ? "text-amber-700 font-medium" : "text-gray-500"}`}>
                            {isConflict ? "換班中" : "尚未決定"}
                          </span>
                        </div>
                      )}
                      <div className="border rounded-lg bg-white p-3 flex items-center justify-between">
                        <span className="font-medium text-gray-800">你</span>
                        {canSetYihsiaoOff ? (
                          <button
                            onClick={() => handleToggleWednesdayOff("yihsiao", dateStr)}
                            className={`px-3 py-1 rounded text-sm ${
                              yihsiaoOff ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {yihsiaoOff ? "取消排休" : "設為不輪晚班"}
                          </button>
                        ) : canSetZhentingOff ? (
                          <button
                            onClick={() => handleToggleWednesdayOff("zhenting", dateStr)}
                            className={`px-3 py-1 rounded text-sm ${
                              zhentingOff ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                            }`}
                          >
                            {zhentingOff ? "取消排休" : "設為不輪晚班"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="border rounded-lg bg-white p-3 flex items-center justify-between">
                        <span className="font-medium text-gray-800">宜孝</span>
                        <span className={`text-sm ${yihsiaoOff ? "text-red-600" : "text-gray-500"}`}>
                          {yihsiaoOff ? "已選不輪晚班" : "尚未選擇"}
                        </span>
                      </div>
                      <div className="border rounded-lg bg-white p-3 flex items-center justify-between">
                        <span className="font-medium text-gray-800">貞葶</span>
                        <span className={`text-sm ${zhentingOff ? "text-red-600" : "text-gray-500"}`}>
                          {zhentingOff ? "已選不輪晚班" : "尚未選擇"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
