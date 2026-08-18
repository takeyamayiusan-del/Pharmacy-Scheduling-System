"use client";

import { useRef, useState } from "react";
import { useApp, type ScheduleShiftCode } from "@/lib/context/AppContext";
import { resolveShiftDisplay, resolveShiftTimeRanges } from "@/lib/shift-catalog/resolve";
import { isPastMonth } from "@/lib/schedule/monthAccess";
import { getDisplayedShiftInfo } from "@/lib/schedule/leaveSchedule";

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export default function MySchedulePage() {
  const {
    currentUser,
    getShiftForDate,
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
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [exportingImage, setExportingImage] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOffset = new Date(year, month - 1, 1).getDay();
  const viewingPast = isPastMonth(year, month);

  if (!currentUser) return null;

  const styleOf = (shift: ScheduleShiftCode) =>
    resolveShiftDisplay(shift, storeConfig, shiftDisplayConfig);

  const exportAsImage = async () => {
    if (!exportRef.current || exportingImage) return;
    setExportingImage(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 3,
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${year}-${String(month).padStart(2, "0")}-${currentUser.name}-我的班表.png`;
      link.click();
    } catch (error) {
      console.error("[my-schedule] export image failed", error);
      alert("匯出圖片失敗，請稍後再試");
    } finally {
      setExportingImage(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 2, 1))}
            className="app-btn-outline shrink-0"
            aria-label="上個月"
          >
            ◀
          </button>
          <h2 className="text-xl sm:text-2xl app-title truncate">
            {year}年{month}月 我的班表
          </h2>
          <button
            onClick={() => setCurrentDate(new Date(year, month, 1))}
            className="app-btn-outline shrink-0"
            aria-label="下個月"
          >
            ▶
          </button>
        </div>
        <button
          type="button"
          className="app-btn-outline shrink-0"
          disabled={exportingImage}
          onClick={() => void exportAsImage()}
        >
          {exportingImage ? "匯出中…" : "匯出圖片"}
        </button>
      </div>
      {viewingPast && (
        <p className="text-sm text-slate-600">已過去的月份僅供查閱。</p>
      )}
      <div ref={exportRef} className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
        <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-6 py-4">
          <h3 className="text-lg font-bold text-white tracking-wide">
            {year}年{month}月　{currentUser.name}　班表
          </h3>
        </div>
        <div className="px-4 pt-4 pb-5">
          <div className="grid grid-cols-7 gap-2 mb-3">
            {dayLabels.map((d, i) => (
              <div
                key={d}
                className={`text-center text-sm font-bold py-1.5 rounded-lg ${
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
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const shiftInfo = getDisplayedShiftInfo({
                date: dateStr,
                employeeId: currentUser.id,
                originalShift: getShiftForDate(dateStr, currentUser.id),
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
              return (
                <div
                  key={dateStr}
                  className={`rounded-xl border-2 p-2.5 min-h-[5.5rem] text-left flex flex-col transition-shadow ${
                    sun
                      ? "bg-red-50 border-red-200"
                      : sat
                        ? "bg-orange-50 border-orange-200"
                        : holiday.isHoliday
                          ? "bg-amber-50 border-amber-200"
                          : "bg-white border-slate-100 hover:shadow"
                  }`}
                >
                  <div className={`text-sm font-bold leading-none mb-1.5 ${sun ? "text-red-500" : sat ? "text-orange-600" : "text-slate-700"}`}>
                    {day}
                  </div>
                  <div
                    className={`text-sm font-bold rounded-lg px-2 py-1 self-start leading-snug ${
                      isFullDayLeave ? "bg-violet-500 text-white" : ""
                    }`}
                    style={
                      isFullDayLeave
                        ? undefined
                        : {
                            backgroundColor: style.bgColor,
                            color: style.textColor,
                            border: `1px solid ${style.borderColor}`,
                          }
                    }
                  >
                    {isFullDayLeave ? "休假" : style.displayText || style.label}
                  </div>
                  {shiftInfo.isPartialLeave && (
                    <div className="text-[11px] text-amber-700 font-medium mt-0.5">半日假</div>
                  )}
                  {ranges.length > 0 && (
                    <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                      {ranges.map((r, ri) => (
                        <div key={ri}>{r}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 border-t border-slate-100 pt-3">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200" />日</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100 border border-orange-200" />六</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" />國定假日</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-500" /><span className="text-violet-700">休假</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
