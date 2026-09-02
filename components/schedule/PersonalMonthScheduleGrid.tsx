"use client";

import { useMemo } from "react";
import { useApp, type ScheduleShiftCode } from "@/lib/context/AppContext";
import { resolveShiftDisplay, resolveShiftTimeRanges } from "@/lib/shift-catalog/resolve";
import { getDisplayedShiftInfo } from "@/lib/schedule/leaveSchedule";

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export type PersonalMonthScheduleGridProps = {
  year: number;
  month: number;
  employeeId: string;
  employeeName: string;
  /** 較小格子，適合嵌在排休選擇頁 */
  compact?: boolean;
  /** 標示因排休選擇而與原班不同的日期 */
  highlightLeaveChanges?: boolean;
  /** 外層標題列（預設顯示） */
  showHeader?: boolean;
  className?: string;
};

export function PersonalMonthScheduleGrid({
  year,
  month,
  employeeId,
  employeeName,
  compact = false,
  highlightLeaveChanges = false,
  showHeader = true,
  className = "",
}: PersonalMonthScheduleGridProps) {
  const {
    getShiftForDate,
    getPlannedShiftForDate,
    getBaseShiftForDate,
    getHolidayInfo,
    isSunday,
    isSaturday,
    shiftDisplayConfig,
    shiftTimeConfig,
    storeConfig,
    leaveRequests,
    overtimeRequests,
  } = useApp();

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOffset = new Date(year, month - 1, 1).getDay();
  const gridCols = compact
    ? "grid grid-cols-[repeat(7,minmax(4.5rem,1fr))] gap-1.5"
    : "grid grid-cols-[repeat(7,minmax(7.5rem,1fr))] gap-2";
  const cellHeight = compact ? "h-[6.5rem]" : "h-[8.25rem]";
  const shiftTextSize = compact ? "text-[15px]" : "text-[18px]";
  const timeTextSize = compact ? "text-[12px]" : "text-[15px]";

  const styleOf = (shift: ScheduleShiftCode) =>
    resolveShiftDisplay(shift, storeConfig, shiftDisplayConfig);

  const leaveChangedDates = useMemo(() => {
    if (!highlightLeaveChanges) return new Set<string>();
    const changed = new Set<string>();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (getPlannedShiftForDate(dateStr, employeeId) !== getShiftForDate(dateStr, employeeId)) {
        changed.add(dateStr);
      }
    }
    return changed;
  }, [
    daysInMonth,
    employeeId,
    getPlannedShiftForDate,
    getShiftForDate,
    highlightLeaveChanges,
    month,
    year,
  ]);

  return (
    <div className={`rounded-2xl border border-slate-200 shadow-sm bg-white ${className}`}>
      {showHeader && (
        <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-4 sm:px-6 py-3 sm:py-4 rounded-t-2xl">
          <h3 className="text-base sm:text-lg font-bold text-white tracking-wide whitespace-nowrap">
            {year}年{month}月　{employeeName}　班表
          </h3>
        </div>
      )}
      <div className="px-3 sm:px-4 pt-3 sm:pt-4 pb-4 sm:pb-5">
        <div className={`${gridCols} mb-2 sm:mb-3`}>
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={`text-center font-bold py-1 rounded-lg ${
                compact ? "text-xs" : "text-sm"
              } ${
                i === 0
                  ? "bg-red-100 text-red-700"
                  : i === 6
                    ? "bg-orange-100 text-orange-700"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className={gridCols}>
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const shiftInfo = getDisplayedShiftInfo({
              date: dateStr,
              employeeId,
              originalShift: getShiftForDate(dateStr, employeeId),
              leaveRequests,
              overtimeRequests,
              getBaseShiftForDate,
            });
            const displayShift = shiftInfo.hasLeave ? shiftInfo.effectiveShift : shiftInfo.originalShift;
            const isFullDayLeave = shiftInfo.hasLeave && shiftInfo.effectiveShift === "X";
            const style = styleOf(displayShift);
            const holiday = getHolidayInfo(dateStr);
            const ranges = isFullDayLeave
              ? []
              : resolveShiftTimeRanges(displayShift, storeConfig, shiftTimeConfig);
            const sun = isSunday(dateStr);
            const sat = isSaturday(dateStr);
            const leaveChanged = leaveChangedDates.has(dateStr);
            const plannedShift = highlightLeaveChanges
              ? getPlannedShiftForDate(dateStr, employeeId)
              : null;
            const plannedStyle =
              plannedShift && leaveChanged ? styleOf(plannedShift) : null;

            return (
              <div
                key={dateStr}
                className={`rounded-xl border-2 p-2 ${cellHeight} text-left grid grid-rows-[auto_1fr_2.5rem] gap-0.5 transition-shadow ${
                  leaveChanged
                    ? "ring-2 ring-emerald-400 ring-offset-1 border-emerald-200"
                    : sun
                      ? "bg-red-50 border-red-200"
                      : sat
                        ? "bg-orange-50 border-orange-200"
                        : holiday.isHoliday
                          ? "bg-amber-50 border-amber-200"
                          : "bg-white border-slate-100"
                }`}
              >
                <div
                  className={`font-bold leading-none ${compact ? "text-sm" : "text-base"} ${
                    sun ? "text-red-500" : sat ? "text-orange-600" : "text-slate-700"
                  }`}
                >
                  {day}
                </div>
                <div className="min-h-0 flex flex-col justify-center">
                  {leaveChanged && plannedStyle && (
                    <div
                      className={`${compact ? "text-[10px]" : "text-[11px]"} text-slate-400 line-through leading-tight`}
                    >
                      原 {plannedStyle.displayText || plannedStyle.label}
                    </div>
                  )}
                  <div
                    className={`${shiftTextSize} font-extrabold leading-tight tracking-wide ${
                      isFullDayLeave ? "text-violet-700" : ""
                    }`}
                    style={
                      isFullDayLeave
                        ? undefined
                        : {
                            color: style.textColor,
                          }
                    }
                  >
                    {isFullDayLeave ? "休假" : style.displayText || style.label}
                  </div>
                  {shiftInfo.isPartialLeave && (
                    <div className={`${compact ? "text-[10px]" : "text-[11px]"} text-amber-700 font-medium mt-0.5`}>
                      半日假
                    </div>
                  )}
                </div>
                <div className={`${timeTextSize} font-semibold text-slate-700 leading-5`}>
                  {[0, 1].map((slot) => (
                    <div key={slot} className={`${compact ? "h-5" : "h-6"} whitespace-nowrap`}>
                      {ranges[slot] ?? "\u00A0"}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500 border-t border-slate-100 pt-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-200" />
            日
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-orange-100 border border-orange-200" />
            六
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />
            國定假日
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-violet-500" />
            <span className="text-violet-700">休假</span>
          </span>
          {highlightLeaveChanges && (
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded ring-2 ring-emerald-400 bg-white" />
              排休後變更
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
