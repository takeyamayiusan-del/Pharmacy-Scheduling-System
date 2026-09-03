"use client";

import { useMemo, useState } from "react";
import { useApp, type PunchRecord, type ScheduleShiftCode } from "@/lib/context/AppContext";
import { resolveShiftDisplay, resolveShiftTimeRanges } from "@/lib/shift-catalog/resolve";
import { getDisplayedShiftInfo } from "@/lib/schedule/leaveSchedule";
import { getShiftName } from "@/lib/store-config";

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export type PersonalAttendanceCalendarProps = {
  year: number;
  month: number;
  employeeId: string;
  employeeName: string;
};

type DayDetail = {
  dateStr: string;
  day: number;
  shift: ScheduleShiftCode;
  shiftLabel: string;
  isRest: boolean;
  timeRanges: string[];
  leaveLabels: string[];
  overtimeLabels: string[];
  punches: PunchRecord[];
};

export function PersonalAttendanceCalendar({
  year,
  month,
  employeeId,
  employeeName,
}: PersonalAttendanceCalendarProps) {
  const {
    getShiftForDate,
    getBaseShiftForDate,
    getHolidayInfo,
    shiftDisplayConfig,
    shiftTimeConfig,
    storeConfig,
    leaveRequests,
    overtimeRequests,
    punchRecords,
  } = useApp();

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOffset = new Date(year, month - 1, 1).getDay();
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() + 1 === month) return now.getDate();
    return 1;
  });

  const dayDetails = useMemo(() => {
    const map = new Map<number, DayDetail>();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const info = getDisplayedShiftInfo({
        date: dateStr,
        employeeId,
        originalShift: getShiftForDate(dateStr, employeeId),
        leaveRequests,
        overtimeRequests,
        getBaseShiftForDate,
      });
      const shift = info.hasLeave ? info.effectiveShift : info.originalShift;
      const display = resolveShiftDisplay(shift, storeConfig, shiftDisplayConfig);
      const ranges =
        shift === "X" ? [] : resolveShiftTimeRanges(shift, storeConfig, shiftTimeConfig);
      const punches = punchRecords
        .filter((p) => p.employeeId === employeeId && p.date === dateStr)
        .slice()
        .sort((a, b) => a.segmentIndex - b.segmentIndex || a.time.localeCompare(b.time));
      const leaveLabels: string[] = [];
      if (info.hasLeave && info.leaveType) {
        const timeHint =
          info.leaveStartTime && info.leaveEndTime
            ? ` ${info.leaveStartTime}–${info.leaveEndTime}`
            : "";
        leaveLabels.push(`${info.leaveType}${timeHint}`);
      }
      const overtimeLabels: string[] = [];
      if (info.hasOvertime && info.overtimeInfo) {
        overtimeLabels.push(`${info.overtimeInfo.startTime}–${info.overtimeInfo.endTime}`);
      }
      map.set(day, {
        dateStr,
        day,
        shift,
        shiftLabel: display.displayText || display.label || getShiftName(storeConfig, shift) || shift,
        isRest: shift === "X",
        timeRanges: ranges,
        leaveLabels,
        overtimeLabels,
        punches,
      });
    }
    return map;
  }, [
    daysInMonth,
    employeeId,
    getBaseShiftForDate,
    getShiftForDate,
    leaveRequests,
    month,
    overtimeRequests,
    punchRecords,
    shiftDisplayConfig,
    shiftTimeConfig,
    storeConfig,
    year,
  ]);

  const selected = dayDetails.get(selectedDay) ?? null;
  const holiday = selected ? getHolidayInfo(selected.dateStr) : null;

  const punchDays = useMemo(() => {
    const rows: DayDetail[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = dayDetails.get(day);
      if (d && (d.punches.length > 0 || d.leaveLabels.length > 0 || d.overtimeLabels.length > 0 || !d.isRest)) {
        rows.push(d);
      }
    }
    return rows;
  }, [dayDetails, daysInMonth]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">考勤日曆 · {employeeName}</h3>
          <span className="text-xs text-slate-500">
            {year}/{month}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-px bg-slate-100 text-center text-[11px] font-medium text-slate-600">
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={`bg-white py-2 ${i === 0 ? "text-rose-600" : i === 6 ? "text-orange-600" : ""}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-slate-100">
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`pad-${i}`} className="bg-white min-h-[4.5rem]" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const detail = dayDetails.get(day)!;
            const selectedCell = selectedDay === day;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`bg-white min-h-[4.5rem] p-1.5 text-left transition ${
                  selectedCell ? "ring-2 ring-inset ring-cyan-400 bg-cyan-50/60" : "hover:bg-slate-50"
                }`}
              >
                <div className="text-[11px] font-semibold text-slate-700">{day}</div>
                {detail.isRest ? (
                  <div className="mt-1 text-[11px] text-slate-400">休</div>
                ) : (
                  <div className="mt-1 inline-flex max-w-full truncate rounded px-1 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-900 border border-amber-200">
                    {detail.shiftLabel}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {detail.overtimeLabels.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400" title="加班" />
                  )}
                  {detail.leaveLabels.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500" title="請假" />
                  )}
                  {detail.punches.length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="打卡" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="rounded-2xl bg-slate-900 text-slate-50 px-4 py-4 space-y-2 shadow-lg">
          <p className="text-sm font-semibold text-white">
            {month}/{selected.day}（{DAY_LABELS[new Date(selected.dateStr).getDay()]}）
            {holiday?.isHoliday ? ` · ${holiday.name || "國定假日"}` : ""}
          </p>
          <ul className="space-y-1.5 text-sm text-slate-200">
            <li>
              · {selected.isRest ? "休假" : selected.shiftLabel}
              {!selected.isRest && selected.timeRanges.length > 0
                ? ` · 應到時段：${selected.timeRanges.join("、")}`
                : ""}
            </li>
            {selected.punches.length > 0 ? (
              <li>
                · 實到打卡：
                {selected.punches
                  .map((p) => `${p.action === "work_in" ? "上" : "下"} ${p.time}`)
                  .join("、")}
              </li>
            ) : (
              <li className="text-slate-400">· 尚無打卡紀錄</li>
            )}
            {selected.overtimeLabels.map((label) => (
              <li key={`ot-${label}`} className="text-violet-300">
                · 加班：{label}
              </li>
            ))}
            {selected.leaveLabels.map((label) => (
              <li key={`lv-${label}`} className="text-sky-300">
                · 請假：{label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">本月打卡紀錄（一日一日）</h3>
          <p className="text-xs text-slate-500 mt-0.5">手機請往下捲動閱讀，較方便對照班表。</p>
        </div>
        <div className="divide-y divide-slate-100">
          {punchDays.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">本月尚無班表／打卡資料</p>
          ) : (
            punchDays.map((d) => (
              <div key={d.dateStr} className="px-4 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">
                    {month}/{d.day}（{DAY_LABELS[new Date(d.dateStr).getDay()]}）
                  </p>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded ${
                      d.isRest
                        ? "bg-slate-100 text-slate-500"
                        : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {d.isRest ? "休" : d.shiftLabel}
                  </span>
                </div>
                {d.timeRanges.length > 0 && !d.isRest && (
                  <p className="text-xs text-slate-500">應到：{d.timeRanges.join("、")}</p>
                )}
                {d.punches.length > 0 ? (
                  <ul className="text-sm text-slate-700 space-y-0.5">
                    {d.punches.map((p) => (
                      <li key={p.id}>
                        {p.action === "work_in" ? "上班" : "下班"}{" "}
                        <span className="font-medium">{p.time}</span>
                        {p.lateMinutes > 0 ? (
                          <span className="ml-2 text-rose-600 text-xs">遲到 {p.lateMinutes} 分</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400">無打卡</p>
                )}
                {d.overtimeLabels.length > 0 && (
                  <p className="text-xs text-violet-700">加班：{d.overtimeLabels.join("、")}</p>
                )}
                {d.leaveLabels.length > 0 && (
                  <p className="text-xs text-sky-700">請假：{d.leaveLabels.join("、")}</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
