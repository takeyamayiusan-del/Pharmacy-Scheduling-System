"use client";

import { useRef, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { isPastMonth } from "@/lib/schedule/monthAccess";
import { PersonalMonthScheduleGrid } from "@/components/schedule/PersonalMonthScheduleGrid";

const SCHEDULE_MIN_WIDTH = "min-w-[56rem]";

export default function MySchedulePage() {
  const { currentUser } = useApp();
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [exportingImage, setExportingImage] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const viewingPast = isPastMonth(year, month);

  if (!currentUser) return null;

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
      <p className="text-sm text-slate-500 sm:hidden">
        班表以桌面版寬度顯示，可左右滑動查看；匯出圖片與電腦版相同。
      </p>
      <div className="overflow-x-auto overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0">
        <div ref={exportRef} className={SCHEDULE_MIN_WIDTH}>
          <PersonalMonthScheduleGrid
            year={year}
            month={month}
            employeeId={currentUser.id}
            employeeName={currentUser.name}
          />
        </div>
      </div>
    </div>
  );
}
