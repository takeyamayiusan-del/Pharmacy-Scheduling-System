"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/context/AppContext";
import { isPastMonth } from "@/lib/schedule/monthAccess";
import { PersonalMonthScheduleGrid } from "@/components/schedule/PersonalMonthScheduleGrid";
import { PersonalAttendanceCalendar } from "@/components/schedule/PersonalAttendanceCalendar";
import { exportPersonalSchedulePdf } from "@/lib/schedule/exportPersonalSchedulePdf";
import { canManageSite, isAccountantRole } from "@/lib/auth/roles";
import { canManagePayroll } from "@/lib/auth/permissions";
import { isEmployeeActiveInMonth } from "@/lib/schedule/employeeActivePeriod";

export default function MySchedulePage() {
  const { currentUser, employees, scheduleEmployees, storeConfig } = useApp();
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [exportingPdf, setExportingPdf] = useState(false);
  const [viewEmployeeId, setViewEmployeeId] = useState<string>("");
  const exportRef = useRef<HTMLDivElement | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const viewingPast = isPastMonth(year, month);

  const canViewOthers =
    canManageSite(currentUser?.role) ||
    isAccountantRole(currentUser?.role) ||
    canManagePayroll(
      { role: currentUser?.role, capabilities: currentUser?.capabilities },
      storeConfig.policies
    );

  const selectableEmployees = useMemo(() => {
    const pool = canViewOthers ? employees : scheduleEmployees;
    return pool.filter(
      (e) => e.role !== "owner" && isEmployeeActiveInMonth(e, year, month)
    );
  }, [canViewOthers, employees, scheduleEmployees, year, month]);

  if (!currentUser) return null;

  const target =
    selectableEmployees.find((e) => e.id === (viewEmployeeId || currentUser.id)) ??
    selectableEmployees.find((e) => e.id === currentUser.id) ??
    currentUser;

  const exportPdf = async () => {
    if (!exportRef.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportPersonalSchedulePdf({
        year,
        month,
        employeeName: target.name,
        element: exportRef.current,
      });
    } catch (error) {
      console.error("[my-schedule] export pdf failed", error);
      alert("匯出 PDF 失敗，請稍後再試");
    } finally {
      setExportingPdf(false);
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
            {year}年{month}月 個人班表
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
          disabled={exportingPdf}
          onClick={() => void exportPdf()}
        >
          {exportingPdf ? "匯出中…" : "匯出 PDF"}
        </button>
      </div>

      {canViewOthers && (
        <div className="app-panel p-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">查看員工個人班表（可匯出列印）</span>
            <select
              value={target.id}
              onChange={(e) => setViewEmployeeId(e.target.value)}
              className="border rounded-lg px-3 py-2 min-w-[12rem]"
            >
              {selectableEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-500 pb-2">店長／會計／老闆可切換員工並匯出 PDF。</p>
        </div>
      )}

      {viewingPast && <p className="text-sm text-slate-600">已過去的月份僅供查閱。</p>}

      {/* 手機：考勤日曆 + 一日一日打卡 */}
      <div className="sm:hidden">
        <PersonalAttendanceCalendar
          year={year}
          month={month}
          employeeId={target.id}
          employeeName={target.name}
        />
      </div>

      {/* 桌面預覽 */}
      <div className="hidden sm:block overflow-x-auto">
        <div className="min-w-[56rem]">
          <PersonalMonthScheduleGrid
            year={year}
            month={month}
            employeeId={target.id}
            employeeName={target.name}
          />
        </div>
      </div>

      {/* 專供 PDF 擷取（螢幕外） */}
      <div className="fixed left-[-10000px] top-0 w-[56rem] pointer-events-none" aria-hidden>
        <div ref={exportRef}>
          <PersonalMonthScheduleGrid
            year={year}
            month={month}
            employeeId={target.id}
            employeeName={target.name}
          />
        </div>
      </div>
    </div>
  );
}
