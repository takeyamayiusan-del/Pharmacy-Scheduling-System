"use client";

import { useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { useRouter } from "next/navigation";

export default function WednesdayShiftsPage() {
  const router = useRouter();
  const {
    currentUser,
    employees,
    getWednesdayOffDates,
    toggleWednesdayOff,
    isWednesdayOff,
  } = useApp();

  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";

  // 動態找出有禮三輪值規則的員工
  const rotationEmployees = employees.filter((e) => e.isWednesdayRotation);

  // 目前使用者是否為輪值員工
  const isParticipant = rotationEmployees.some((e) => e.id === currentUser?.id);

  // 取得本月所有禮拜三
  const getWednesdays = () => {
    const wednesdays: { day: number; dateStr: string }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (new Date(dateStr).getDay() === 3) {
        wednesdays.push({ day, dateStr });
      }
    }
    return wednesdays;
  };

  const wednesdays = getWednesdays();

  const prevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month, 1));

  const handleToggleOff = async (employeeId: string, dateStr: string) => {
    const selfId = currentUser?.id;
    if (!selfId || selfId !== employeeId) return;

    const selfAlreadyOff = isWednesdayOff(selfId, dateStr);

    // 如果是「新增不輪晚班」且有其他輪值員工也選了 → 提示換班
    if (!selfAlreadyOff) {
      const conflictPeer = rotationEmployees.find(
        (e) => e.id !== selfId && isWednesdayOff(e.id, dateStr)
      );
      if (conflictPeer) {
        const shouldNavigate = window.confirm(
          `這天 ${conflictPeer.name} 已選不輪晚班，雙方衝突。是否前往換班申請？`
        );
        if (shouldNavigate) {
          const params = new URLSearchParams({
            date: dateStr,
            targetEmployeeId: conflictPeer.id,
            source: "wednesday_conflict",
            source_note: "由禮三晚班衝突引導建立",
          });
          router.push(`/applications/shift-swap?${params.toString()}`);
          return;
        }
      }
    }

    const result = await toggleWednesdayOff(employeeId, dateStr);
    if (!result.success && result.message) {
      alert(result.message);
    }
  };

  // 沒有輪值員工也沒有管理權限，顯示說明
  if (!canManage && !isParticipant) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h1 className="text-2xl font-bold text-gray-900">禮拜三晚班輪流</h1>
          <p className="text-gray-500 mt-2">
            此功能僅開放禮拜三晚班輪值員工使用（店長/老闆可檢視）。
          </p>
        </div>
      </div>
    );
  }

  // 沒有設定輪值員工
  if (rotationEmployees.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h1 className="text-2xl font-bold text-gray-900">禮拜三晚班輪流</h1>
          <p className="text-gray-500 mt-2">
            目前尚未設定禮拜三晚班輪值員工，請前往「固定班表管理」→「特殊排班規則」啟用。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 標題 + 月份切換 */}
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={prevMonth} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50">
          ◀
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {year}年{month}月 禮拜三晚班輪流
        </h1>
        <button onClick={nextMonth} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50">
          ▶
        </button>
      </div>

      {/* 說明 */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
        <h3 className="font-medium text-sky-800 mb-1">🧭 操作說明</h3>
        <div className="text-sm text-slate-700 space-y-1">
          <p>每月最多可選 2 個禮拜三「不輪晚班」。</p>
          <p>若與另一位輪值員工衝突，系統會提示換班。</p>
          <p>
            目前輪值員工：
            <strong> {rotationEmployees.map((e) => e.name).join("、")}</strong>
          </p>
        </div>
      </div>

      {/* 本月已選統計（輪值員工可見） */}
      {isParticipant && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {rotationEmployees.map((emp) => {
            const offDates = getWednesdayOffDates(emp.id, year, month);
            const isSelf = emp.id === currentUser?.id;
            return (
              <div
                key={emp.id}
                className={`rounded-xl p-4 border ${
                  isSelf ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
                }`}
              >
                <p className="text-sm font-medium text-gray-700">
                  {isSelf ? `🙋 你（${emp.name}）` : `👀 ${emp.name}`}
                </p>
                <p className="text-lg font-bold text-gray-900 mt-1">{offDates.length}/2 天</p>
              </div>
            );
          })}
        </div>
      )}

      {/* 禮拜三列表 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">本月禮拜三</h3>
          <div className="grid gap-3">
            {wednesdays.map(({ day, dateStr }) => {
              // 取得每位輪值員工的狀態
              const empStatus = rotationEmployees.map((emp) => ({
                ...emp,
                isOff: isWednesdayOff(emp.id, dateStr),
                offDatesCount: getWednesdayOffDates(emp.id, year, month).length,
              }));

              const offCount = empStatus.filter((e) => e.isOff).length;
              const onDutyEmps = empStatus.filter((e) => !e.isOff);
              const isConflict = offCount === rotationEmployees.length;
              const isAllOn = offCount === 0;

              // 誰值晚班（只有一個人沒選休 → 他值）
              const onDutyLabel =
                !isConflict && onDutyEmps.length === 1
                  ? `${onDutyEmps[0].name} 值晚班`
                  : isConflict
                  ? "全員休假（衝突）"
                  : isAllOn
                  ? "尚未決定"
                  : onDutyEmps.map((e) => e.name).join("、") + " 值晚班";

              return (
                <div
                  key={dateStr}
                  className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
                >
                  {/* 日期標題 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">
                        {month}月{day}日
                      </span>
                      <span className="text-gray-400 text-sm">（禮拜三）</span>
                    </div>
                    <span
                      className={`text-sm font-medium px-3 py-1 rounded-full ${
                        isConflict
                          ? "bg-amber-100 text-amber-700"
                          : onDutyEmps.length === 1
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {onDutyLabel}
                    </span>
                  </div>

                  {/* 各輪值員工狀態 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {empStatus.map((emp) => {
                      const isSelf = emp.id === currentUser?.id;
                      const canToggle = isSelf; // 只能切換自己

                      return (
                        <div
                          key={emp.id}
                          className="bg-white border rounded-lg px-4 py-2.5 flex items-center justify-between"
                        >
                          <span className="font-medium text-gray-800">
                            {emp.name}
                            {isSelf && (
                              <span className="ml-1 text-xs text-gray-400">（你）</span>
                            )}
                          </span>
                          {canToggle ? (
                            <button
                              onClick={() => handleToggleOff(emp.id, dateStr)}
                              disabled={
                                !emp.isOff && emp.offDatesCount >= 2
                              }
                              className={`px-3 py-1 rounded text-sm transition-colors ${
                                emp.isOff
                                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              {emp.isOff ? "取消排休" : "設為不輪晚班"}
                            </button>
                          ) : (
                            <span
                              className={`text-sm ${
                                emp.isOff ? "text-red-600 font-medium" : "text-gray-400"
                              }`}
                            >
                              {emp.isOff ? "已選不輪晚班" : "尚未選擇"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {wednesdays.length === 0 && (
              <p className="text-center text-gray-400 py-6">本月沒有禮拜三</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
