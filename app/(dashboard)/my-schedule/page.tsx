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
        scale: 2,
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
      <div ref={exportRef} className="app-card p-4 bg-white">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-slate-900">
            {year}年{month}月 {currentUser.name} 我的班表
          </h3>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs sm:text-sm font-medium text-slate-500 mb-2">
          {dayLabels.map((d) => (
            <div key={d}>{d}</div>
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
            return (
              <div
                key={dateStr}
                className={`rounded-2xl border p-3 min-h-[6rem] text-left flex flex-col gap-1 ${
                  isSunday(dateStr)
                    ? "bg-red-50 border-red-100"
                    : isSaturday(dateStr)
                      ? "bg-orange-50 border-orange-100"
                      : holiday.isHoliday
                        ? "bg-amber-50 border-amber-100"
                        : "bg-white border-slate-200"
                }`}
              >
                <div className="text-sm sm:text-base text-slate-500 leading-none">{day}</div>
                <div
                  className={`text-sm sm:text-[15px] font-semibold rounded px-2 py-1 inline-flex items-center justify-center max-w-full ${
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
                  <span className="truncate w-full" title={isFullDayLeave ? "假" : style.displayText || style.label}>
                    {isFullDayLeave ? "假" : style.displayText || style.label}
                  </span>
                </div>
                {shiftInfo.isPartialLeave && (
                  <div className="text-[11px] sm:text-xs text-amber-700 leading-tight">
                    半日假
                  </div>
                )}
                {ranges.length > 0 && (
                  <div className="text-[11px] sm:text-xs text-slate-500 leading-tight whitespace-pre-wrap break-words">
                    {ranges.join(" ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
