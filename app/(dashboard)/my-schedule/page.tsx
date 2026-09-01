"use client";

import { useRef, useState } from "react";
import { useApp, type ScheduleShiftCode } from "@/lib/context/AppContext";
import { resolveShiftDisplay, resolveShiftTimeRanges } from "@/lib/shift-catalog/resolve";
import { isPastMonth } from "@/lib/schedule/monthAccess";
import { getDisplayedShiftInfo } from "@/lib/schedule/leaveSchedule";

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

/** 與桌面版相同的最小寬度，手機可橫向捲動；匯出圖片亦以此寬度渲染 */
const SCHEDULE_MIN_WIDTH = "min-w-[56rem]";
const SCHEDULE_GRID = "grid grid-cols-[repeat(7,minmax(7.5rem,1fr))] gap-2";

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
      const el = exportRef.current;
      const canvas = await html2canvas(el, {
        backgroundColor: "#ffffff",
        scale: 3,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
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
      <p className="text-sm text-slate-500 sm:hidden">班表以桌面版寬度顯示，可左右滑動查看；匯出圖片與電腦版相同。</p>
      <div className="overflow-x-auto overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          ref={exportRef}
          className={`rounded-2xl border border-slate-200 shadow-sm bg-white ${SCHEDULE_MIN_WIDTH}`}
        >
        <div className="bg-gradient-to-r from-sky-600 to-sky-500 px-6 py-4 rounded-t-2xl">
          <h3 className="text-lg font-bold text-white tracking-wide whitespace-nowrap">
            {year}年{month}月　{currentUser.name}　班表
          </h3>
        </div>
        <div className="px-4 pt-4 pb-5">
          <div className={`${SCHEDULE_GRID} mb-3`}>
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
          <div className={SCHEDULE_GRID}>
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
                  className={`rounded-xl border-2 p-2.5 h-[8.25rem] text-left grid grid-rows-[auto_1fr_3.25rem] gap-0.5 transition-shadow ${
                    sun
                      ? "bg-red-50 border-red-200"
                      : sat
                        ? "bg-orange-50 border-orange-200"
                        : holiday.isHoliday
                          ? "bg-amber-50 border-amber-200"
                          : "bg-white border-slate-100 hover:shadow"
                  }`}
                >
                  <div className={`text-base font-bold leading-none ${sun ? "text-red-500" : sat ? "text-orange-600" : "text-slate-700"}`}>
                    {day}
                  </div>
                  <div className="min-h-0 flex flex-col justify-center">
                    <div
                      className={`text-[18px] font-extrabold leading-tight tracking-wide ${
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
                      <div className="text-[11px] text-amber-700 font-medium mt-0.5">半日假</div>
                    )}
                  </div>
                  <div className="text-[15px] font-semibold text-slate-700 leading-6">
                    {[0, 1].map((slot) => (
                      <div key={slot} className="h-6 whitespace-nowrap">
                        {ranges[slot] ?? "\u00A0"}
                      </div>
                    ))}
                  </div>
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
    </div>
  );
}
