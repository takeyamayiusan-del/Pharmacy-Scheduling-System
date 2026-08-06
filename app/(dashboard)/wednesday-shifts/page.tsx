"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { useRouter } from "next/navigation";
import {
  formatWeekdaysLabel,
  getMonthRotationDates,
  weekdayLabel,
} from "@/lib/store-config";
import { getLocalDayOfWeek } from "@/lib/schedule/sundayRest";

export default function WednesdayShiftsPage() {
  const router = useRouter();
  const {
    currentUser,
    employees,
    getWednesdayOffDates,
    getWednesdayOffLimit,
    toggleWednesdayOff,
    isWednesdayOff,
    storeConfig,
  } = useApp();

  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const canManage = currentUser?.role === "owner" || currentUser?.role === "manager";
  const featureOn = storeConfig.features.rotationEvening;
  const menuLabel = storeConfig.rotationEvening.menuLabel;
  const weekdaysLabel = formatWeekdaysLabel(storeConfig.rotationEvening.weekdays);

  const rotationEmployees = employees.filter((e) => e.isWednesdayRotation);
  const isParticipant = rotationEmployees.some((e) => e.id === currentUser?.id);

  const rotationDates = useMemo(
    () =>
      getMonthRotationDates(year, month, storeConfig.rotationEvening.weekdays).map(
        (dateStr) => ({
          day: Number(dateStr.slice(8, 10)),
          dateStr,
          dow: getLocalDayOfWeek(dateStr),
        })
      ),
    [year, month, storeConfig.rotationEvening.weekdays]
  );

  const offLimit = getWednesdayOffLimit(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month, 1));

  const handleToggleOff = async (employeeId: string, dateStr: string) => {
    const selfId = currentUser?.id;
    if (!selfId || selfId !== employeeId) return;

    const selfAlreadyOff = isWednesdayOff(selfId, dateStr);

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
            source_note: `由${menuLabel}衝突引導建立`,
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

  if (!featureOn) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h1 className="text-2xl font-bold text-gray-900">{menuLabel}</h1>
          <p className="text-gray-500 mt-2">
            本店未開放週期輪值晚班功能。店長可至「店家設定」開啟。
          </p>
        </div>
      </div>
    );
  }

  if (!canManage && !isParticipant) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h1 className="text-2xl font-bold text-gray-900">{menuLabel}</h1>
          <p className="text-gray-500 mt-2">
            此功能僅開放輪值晚班員工使用（店長/老闆可檢視）。
          </p>
        </div>
      </div>
    );
  }

  if (rotationEmployees.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h1 className="text-2xl font-bold text-gray-900">{menuLabel}</h1>
          <p className="text-gray-500 mt-2">
            目前尚未設定輪值員工，請前往「固定班表管理」→「特殊排班規則」啟用。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <button onClick={prevMonth} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50">
          ◀
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {year}年{month}月 {menuLabel}
        </h1>
        <button onClick={nextMonth} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50">
          ▶
        </button>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
        <h3 className="font-medium text-sky-800 mb-1">🧭 操作說明</h3>
        <div className="text-sm text-slate-700 space-y-1">
          <p>
            輪值日：{weekdaysLabel}。每月可選「不輪晚班」上限：{offLimit} 天
            {storeConfig.rotationEvening.monthlyOffLimit == null
              ? "（依本月輪值日數量自動調整）"
              : "（店家設定固定上限）"}
            。
          </p>
          <p>
            值晚班班別：{storeConfig.rotationEvening.onDutyShift}；其餘輪值員工：
            {storeConfig.rotationEvening.offDutyShift}。
          </p>
          <p>若與另一位輪值員工衝突，系統會提示換班。</p>
          <p className="text-emerald-800 font-medium">
            建議：{menuLabel}有衝突時，先完成換班，再去「排休選擇」勾休假日。
          </p>
          <p>
            目前輪值員工：
            <strong> {rotationEmployees.map((e) => e.name).join("、")}</strong>
          </p>
        </div>
      </div>

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
                <p className="text-lg font-bold text-gray-900 mt-1">
                  {offDates.length}/{offLimit} 天
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-6">
          <h3 className="font-medium text-gray-900 mb-4">本月輪值日（{weekdaysLabel}）</h3>
          <div className="grid gap-3">
            {rotationDates.map(({ day, dateStr, dow }) => {
              const empStatus = rotationEmployees.map((emp) => ({
                ...emp,
                isOff: isWednesdayOff(emp.id, dateStr),
                offDatesCount: getWednesdayOffDates(emp.id, year, month).length,
              }));

              const offCount = empStatus.filter((e) => e.isOff).length;
              const onDutyEmps = empStatus.filter((e) => !e.isOff);
              const isConflict = offCount === rotationEmployees.length;
              const isAllOn = offCount === 0;

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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">
                        {month}月{day}日
                      </span>
                      <span className="text-gray-400 text-sm">
                        （禮拜{weekdayLabel(dow)}）
                      </span>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {empStatus.map((emp) => {
                      const isSelf = emp.id === currentUser?.id;
                      const canToggle = isSelf;

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
                              disabled={!emp.isOff && emp.offDatesCount >= offLimit}
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

            {rotationDates.length === 0 && (
              <p className="text-center text-gray-400 py-6">本月沒有輪值日</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
