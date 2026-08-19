"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp, type ScheduleShiftCode } from "@/lib/context/AppContext";
import { canManageSite } from "@/lib/auth/roles";
import { isPastDate, isPastMonth } from "@/lib/schedule/monthAccess";
import { isEmployeeActiveInMonth, isEmployeeActiveOnDate } from "@/lib/schedule/employeeActivePeriod";
import { getDisplayedShiftInfo } from "@/lib/schedule/leaveSchedule";
import {
  getScheduleShiftOptions,
  resolveShiftDisplay,
  resolveShiftTimeRanges,
} from "@/lib/shift-catalog/resolve";
import { getShiftName } from "@/lib/store-config";
import {
  resolveEmployeeCycleAnchor,
  resolveEmployeeWorkHoursRegime,
} from "@/lib/attendance/employeeRegime";
import { workHoursRegimeMeta } from "@/lib/attendance/workHoursRegime";

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export default function PersonSchedulePage() {
  const {
    currentUser,
    employees,
    storeConfig,
    shiftDisplayConfig,
    shiftTimeConfig,
    getShiftForDate,
    getScheduleNote,
    getHolidayInfo,
    isSunday,
    isSaturday,
    updateShift,
    getBaseShiftForDate,
    leaveRequests,
    overtimeRequests,
  } = useApp();

  const isManager = canManageSite(currentUser?.role);
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [employeeId, setEmployeeId] = useState("");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOffset = new Date(year, month - 1, 1).getDay();
  const viewingPast = isPastMonth(year, month);

  const staff = useMemo(
    () =>
      employees.filter(
        (e) => e.role !== "owner" && isEmployeeActiveInMonth(e, year, month)
      ),
    [employees, year, month]
  );
  const emp = staff.find((e) => e.id === employeeId) ?? staff[0];
  const selectedId = emp?.id ?? "";
  const shiftOptions = getScheduleShiftOptions(storeConfig);
  const baseline =
    emp?.baselineShift?.trim() || storeConfig.defaultWeekdayShift || "B";
  const regime = emp
    ? resolveEmployeeWorkHoursRegime(emp, storeConfig)
    : storeConfig.workHoursRegime;
  const cycleAnchor = emp
    ? resolveEmployeeCycleAnchor(emp, storeConfig, storeConfig.policies)
    : storeConfig.workHoursCycleAnchor;

  const applyBaselineMonth = async () => {
    if (!emp) return;
    const ok = window.confirm(
      `把 ${emp.name} ${year}年${month}月尚未過去、非週日、非排休的日子，寫成預設班「${getShiftName(storeConfig, baseline)}」？之後仍可逐日改。`
    );
    if (!ok) return;
    setBusy(true);
    try {
      let written = 0;
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (isSunday(dateStr) && storeConfig.policies.sundayFixedRest) continue;
        if (isPastDate(dateStr)) continue;
        if (getBaseShiftForDate(dateStr, emp.id) === "X") continue;
        if (!isEmployeeActiveOnDate(emp, dateStr)) continue;
        const shift = isSaturday(dateStr)
          ? storeConfig.defaultSaturdayShift
          : baseline;
        await updateShift(dateStr, emp.id, shift as ScheduleShiftCode);
        written += 1;
      }
      alert(`已套用 ${written} 日預設班。`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "套用失敗");
    } finally {
      setBusy(false);
    }
  };

  if (!isManager) {
    return (
      <div className="app-panel p-6">
        <p className="text-sm text-gray-600">僅店長、副店或老闆可單人排班。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <div>
          <h2 className="app-page-title">單人排班</h2>
          <p className="app-meta mt-1">
            先在員工管理設個人變形工時與本月預設班，再於此對單一員工逐日改班。集集班別多、無法全自動時用這頁。
          </p>
        </div>
        <Link href="/schedule" className="app-btn-outline">
          回月曆式班表
        </Link>
      </div>

      <div className="app-panel p-4 flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="block text-gray-700 mb-1">員工</span>
          <select
            value={selectedId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              setEditingDate(null);
            }}
            className="border rounded-lg px-3 py-2 min-w-[10rem]"
          >
            {staff.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="app-btn-outline"
            onClick={() => setCurrentDate(new Date(year, month - 2, 1))}
          >
            ◀
          </button>
          <span className="font-medium">
            {year}年{month}月
          </span>
          <button
            type="button"
            className="app-btn-outline"
            onClick={() => setCurrentDate(new Date(year, month, 1))}
          >
            ▶
          </button>
        </div>
        <button
          type="button"
          className="app-btn-primary"
          disabled={busy || viewingPast || !emp}
          onClick={() => void applyBaselineMonth()}
        >
          {busy ? "套用中…" : "套用本月預設班"}
        </button>
      </div>

      {emp && (
        <p className="text-sm text-gray-600">
          {emp.name}：{workHoursRegimeMeta(regime).label}（週期起算 {cycleAnchor}
          {storeConfig.policies.workHoursCycleFromHireDate && emp.hireDate
            ? "，依入職日"
            : "，依店家設定"}
          ）；沒休假時預設上{" "}
          <span className="font-medium">{getShiftName(storeConfig, baseline)}</span>
          。{storeConfig.policies.sundayFixedRest ? "週日公休。" : "週日可排班。"}點日期改班。
        </p>
      )}

      {viewingPast && (
        <p className="text-sm text-slate-600">已過去的月份僅供查閱。</p>
      )}

      {emp && (
        <div className="app-card p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 mb-2">
            {dayLabels.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const shift = getShiftForDate(dateStr, emp.id);
              const shiftInfo = getDisplayedShiftInfo({
                date: dateStr,
                employeeId: emp.id,
                originalShift: shift,
                leaveRequests,
                overtimeRequests,
                getBaseShiftForDate,
              });
              const displayShift = shiftInfo.hasLeave ? shiftInfo.effectiveShift : shiftInfo.originalShift;
              const isFullDayLeave = shiftInfo.hasLeave && shiftInfo.effectiveShift === "X";
              const style = resolveShiftDisplay(displayShift, storeConfig, shiftDisplayConfig);
              const holiday = getHolidayInfo(dateStr);
              const note = getScheduleNote(dateStr, emp.id);
              const ranges = isFullDayLeave
                ? []
                : resolveShiftTimeRanges(displayShift, storeConfig, shiftTimeConfig);
              const sun = isSunday(dateStr);
              const editable = !sun && !isPastDate(dateStr);
              const isEditing = editingDate === dateStr;
              return (
                <div
                  key={dateStr}
                  className={`min-h-[6.5rem] rounded-xl border p-1.5 text-left ${
                    sun ? "bg-red-50 border-red-100" : "bg-white border-slate-200"
                  } ${holiday.isHoliday && !sun ? "ring-1 ring-amber-300" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{day}</span>
                    <span className="flex gap-0.5">
                      {holiday.isHoliday && !sun && (
                        <span className="text-[10px] text-amber-800 bg-amber-200 rounded px-1">
                          國
                        </span>
                      )}
                      {note?.kind === "auto_rest" && (
                        <span
                          className="text-[10px] text-white bg-violet-600 rounded px-1"
                          title={note.note}
                        >
                          播
                        </span>
                      )}
                      {note?.kind === "half_day_leave" && (
                        <span
                          className="text-[10px] text-white bg-teal-600 rounded px-1"
                          title={note.note}
                        >
                          半
                        </span>
                      )}
                    </span>
                  </div>
                  {holiday.isHoliday && !sun && (
                    <p className="text-[10px] text-amber-800 leading-tight mb-1">
                      {(holiday.name ?? "國定假日").replace(/\n/g, "")}
                    </p>
                  )}
                  {isEditing ? (
                    <select
                      autoFocus
                      className="w-full text-xs border rounded px-1 py-1"
                      value={shift}
                      onChange={(e) => {
                        void updateShift(
                          dateStr,
                          emp.id,
                          e.target.value as ScheduleShiftCode
                        )
                          .then(() => setEditingDate(null))
                          .catch((err) =>
                            alert(err instanceof Error ? err.message : "更新失敗")
                          );
                      }}
                      onBlur={() => setEditingDate(null)}
                    >
                      {shiftOptions.map((code) => (
                        <option key={code} value={code}>
                          {getShiftName(storeConfig, code)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => editable && setEditingDate(dateStr)}
                      style={
                        isFullDayLeave
                          ? undefined
                          : {
                              backgroundColor: style.bgColor,
                              color: style.textColor,
                              borderColor: style.borderColor,
                            }
                      }
                      className={`w-full rounded border text-xs font-semibold py-1 ${
                        isFullDayLeave ? "bg-violet-500 text-white border-violet-600" : ""
                      } ${editable ? "hover:opacity-80" : "opacity-70 cursor-default"}`}
                    >
                      {isFullDayLeave ? "假" : style.displayText || style.label}
                    </button>
                  )}
                  {shiftInfo.isPartialLeave && (
                    <p className="text-[10px] text-amber-700 mt-1 leading-tight">半日假</p>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                    {ranges.slice(0, 2).join(" ")}
                  </p>
                  {note?.note && (
                    <p className="text-[10px] text-violet-800 mt-1 leading-tight">
                      {note.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
