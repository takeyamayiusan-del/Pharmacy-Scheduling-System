"use client";

import { useState, useEffect, useMemo } from "react";
import { useApp, type ScheduleShiftCode } from "@/lib/context/AppContext";
import { canManageSite } from "@/lib/auth/roles";
import { exportSchedulePdf, type ExportLayout } from "@/lib/schedule/exportSchedulePdf";
import { buildScheduleWarnings } from "@/lib/schedule/scheduleWarnings";
import { buildDeformedHoursSoftWarnings } from "@/lib/attendance/deformedHoursSoftWarnings";
import { workHoursRegimeMeta } from "@/lib/attendance/workHoursRegime";
import { formatShiftName } from "@/lib/schedule/shiftLabels";
import { isPastDate, isPastMonth } from "@/lib/schedule/monthAccess";
import { isEmployeeActiveInMonth } from "@/lib/schedule/employeeActivePeriod";
import { calculateLeaveDisplayOnSchedule, getOriginalShiftForLeaveDay } from "@/lib/schedule/leaveSchedule";
import {
  getHolidayWorkShiftOptions,
  type HolidayWorkShiftChoice,
} from "@/lib/schedule/holidayOneClick";
import { createClient } from "@/lib/supabase/client";
import BulletinBoard from "@/components/BulletinBoard";
import PersonalPayslip from "@/components/PersonalPayslip";
import FlexibleAttendancePanel from "@/components/FlexibleAttendancePanel";
import { AutoRestPreviewPanel } from "@/components/schedule/AutoRestPreviewPanel";
import { HelpTip } from "@/components/ui/HelpTip";
import { CollapsibleCard } from "@/components/ui/CollapsibleCard";
import {
  getScheduleShiftOptions,
  resolveShiftDisplay,
  resolveShiftTimeRanges,
} from "@/lib/shift-catalog/resolve";

const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

export default function SchedulePage() {
  const { 
    currentUser, 
    employees,
    updateShift, 
    isSunday, 
    isSaturday,
    getHolidayInfo,
    refreshHolidayCalendar,
    fixedShifts,
    wednesdayNightShifts,
    countSaturdaysInMonth,
    getShiftForDate,
    getBaseShiftForDate,
    applyNationalHolidayOneClick,
    refreshSchedule,
    getWednesdayOffDates,
    shiftTimeConfig,
    shiftDisplayConfig,
    isLeaveMonthLocked,
    lockLeaveMonth,
    unlockLeaveMonth,
    leaveRequests,
    overtimeRequests,
    storeConfig,
    activeSiteId,
  } = useApp();
  
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [holidayRefreshYear, setHolidayRefreshYear] = useState<number>(new Date().getFullYear());
  const [isRefreshingHolidays, setIsRefreshingHolidays] = useState(false);
  const [holidayRefreshMessage, setHolidayRefreshMessage] = useState<string | null>(null);
  const [holidayOneClickBusy, setHolidayOneClickBusy] = useState<string | null>(null);
  const [holidayOneClickMessage, setHolidayOneClickMessage] = useState<string | null>(null);
  const [holidayWorkShiftByDate, setHolidayWorkShiftByDate] = useState<
    Record<string, HolidayWorkShiftChoice>
  >({});
  const [editingCell, setEditingCell] = useState<{ date: string; employeeId: string } | null>(null);

  // 班表規則說明（可編輯；依店分開）
  const supabase = createClient();
  const [schedulingNotes, setSchedulingNotes] = useState("");
  const [notesId, setNotesId] = useState<string | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSchedulingNotes("");
    setNotesId(null);
    setIsEditingNotes(false);
    supabase
      .from("scheduling_notes")
      .select("id, content")
      .eq("site_id", activeSiteId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setSchedulingNotes(data.content);
          setNotesId(data.id);
        }
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  const saveNotes = async () => {
    if (notesId) {
      await supabase.from("scheduling_notes")
        .update({ content: notesDraft, updated_by: currentUser?.id })
        .eq("id", notesId)
        .eq("site_id", activeSiteId);
    } else {
      const { data } = await supabase.from("scheduling_notes")
        .upsert(
          { content: notesDraft, updated_by: currentUser?.id, site_id: activeSiteId },
          { onConflict: "site_id" }
        )
        .select()
        .single();
      if (data) setNotesId(data.id);
    }
    setSchedulingNotes(notesDraft);
    setIsEditingNotes(false);
  };
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showOriginalShift, setShowOriginalShift] = useState(false); // 新增：是否顯示原始班表
  const [activeLegendShift, setActiveLegendShift] = useState<ScheduleShiftCode | null>(null);
  const [lockingMonth, setLockingMonth] = useState(false);
  const [deformedHoursOpen, setDeformedHoursOpen] = useState(false);
  const [fixedShiftsOpen, setFixedShiftsOpen] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [typhoonDates, setTyphoonDates] = useState<Record<string, { title: string; periodLabel: string }>>({});
  const [typhoonReloadKey, setTyphoonReloadKey] = useState(0);

  const useCatalog = storeConfig.features.customShiftCatalog;
  // 兩店同一入口：竹山 catalog 關 → 回傳啟用中 A–E；集集 → 目錄碼
  const shiftOptions = getScheduleShiftOptions(storeConfig);
  const holidayWorkShiftOptions = useMemo(
    () => getHolidayWorkShiftOptions(storeConfig),
    [storeConfig]
  );
  const styleOf = (code: string) =>
    resolveShiftDisplay(code, storeConfig, shiftDisplayConfig);
  const rangesOf = (code: string) =>
    resolveShiftTimeRanges(code, storeConfig, shiftTimeConfig);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("flexible_attendance_days")
        .select("day_date, title, period_mode, from_time, status")
        .eq("site_id", activeSiteId)
        .neq("status", "cancelled")
        .gte("day_date", `${year}-${String(month).padStart(2, "0")}-01`)
        .lte("day_date", `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`);
      if (cancelled || !data) return;
      const map: Record<string, { title: string; periodLabel: string }> = {};
      data.forEach((row) => {
        const date = String(row.day_date).slice(0, 10);
        const periodLabel =
          row.period_mode === "full_day"
            ? "全日"
            : `${String(row.from_time ?? "").slice(0, 5)}起`;
        map[date] = {
          title: String(row.title ?? "颱風假"),
          periodLabel,
        };
      });
      setTyphoonDates(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, year, month, daysInMonth, typhoonReloadKey, activeSiteId]);

  const saturdayCount = countSaturdaysInMonth(year, month);
  const monthLocked = isLeaveMonthLocked(year, month);
  const viewingPastMonth = isPastMonth(year, month);
  // 過濾老闆，以及尚未到職／已過到期日的員工（依當月）
  const displayEmployees = employees.filter(
    (e) => e.role !== "owner" && isEmployeeActiveInMonth(e, year, month)
  );
  const scheduleWarnings = buildScheduleWarnings({
    year,
    month,
    daysInMonth,
    employees: displayEmployees,
    shiftDisplayConfig,
    getShiftForDate,
    storeConfig,
    shiftTimeConfig,
  });
  const deformedHoursWarnings = useMemo(
    () =>
      buildDeformedHoursSoftWarnings({
        year,
        month,
        employees: displayEmployees,
        storeConfig,
        shiftTimeConfig,
        getShiftForDate,
      }),
    [year, month, displayEmployees, storeConfig, shiftTimeConfig, getShiftForDate]
  );
  const hasStaffingAlerts = scheduleWarnings.length > 0;
  const hasDeformedHoursAlerts = deformedHoursWarnings.length > 0;
  const hardComplianceWarnings = deformedHoursWarnings.filter((w) => w.severity === "hard");
  const softComplianceWarnings = deformedHoursWarnings.filter((w) => w.severity === "soft");
  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;
  const today = new Date();
  const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    setHolidayRefreshYear(year);
  }, [year]);

  useEffect(() => {
    try {
      const fixedSaved = window.localStorage.getItem(`schedule-fixed-open:${storageScope}`);
      const deformedSaved = window.localStorage.getItem(`schedule-deformed-open:${storageScope}`);
      if (fixedSaved === "1") setFixedShiftsOpen(true);
      if (fixedSaved === "0") setFixedShiftsOpen(false);
      if (deformedSaved === "1") setDeformedHoursOpen(true);
      if (deformedSaved === "0") setDeformedHoursOpen(false);
    } catch {
      // ignore storage read errors
    }
  }, [storageScope]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`schedule-fixed-open:${storageScope}`, fixedShiftsOpen ? "1" : "0");
    } catch {
      // ignore storage write errors
    }
  }, [storageScope, fixedShiftsOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`schedule-deformed-open:${storageScope}`, deformedHoursOpen ? "1" : "0");
    } catch {
      // ignore storage write errors
    }
  }, [storageScope, deformedHoursOpen]);

  const refreshHolidays = async () => {
    setIsRefreshingHolidays(true);
    setHolidayRefreshMessage(null);
    try {
      await refreshHolidayCalendar(holidayRefreshYear);
      setHolidayRefreshMessage(`${holidayRefreshYear} 年假期已更新`);
    } catch (error) {
      setHolidayRefreshMessage(
        error instanceof Error ? error.message : "假期更新失敗，請稍後再試"
      );
    } finally {
      setIsRefreshingHolidays(false);
    }
  };

  const rotationEmployees = employees.filter((e) => e.isWednesdayRotation);
  const rotationLabel =
    rotationEmployees.length > 0
      ? rotationEmployees.map((e) => e.name).join("/")
      : "尚未設定";
  const isManager = canManageSite(currentUser?.role);

  const monthNationalHolidays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const info = getHolidayInfo(dateStr);
    if (!info.isHoliday || isSunday(dateStr)) return null;
    return {
      date: dateStr,
      day,
      name: (info.name ?? "國定假日").replace(/\n/g, ""),
      isPast: isPastDate(dateStr),
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const handleHolidayOneClick = async (
    date: string,
    mode: "work" | "off",
    workShiftChoice?: HolidayWorkShiftChoice
  ) => {
    if (!isManager || holidayOneClickBusy) return;
    const shiftLabel =
      mode === "work"
        ? workShiftChoice && workShiftChoice !== "auto"
          ? `班別 ${workShiftChoice}`
          : "依固定班"
        : "";
    const label =
      mode === "work"
        ? `設為上班（${shiftLabel}；已排休／全日請假維持休假）`
        : "設為全員休假";
    if (!window.confirm(`確定對 ${date} ${label}？`)) return;

    setHolidayOneClickBusy(`${date}:${mode}`);
    setHolidayOneClickMessage(null);
    try {
      const result = await applyNationalHolidayOneClick(
        date,
        mode,
        mode === "work" ? { workShiftChoice: workShiftChoice ?? "auto" } : undefined
      );
      await refreshSchedule();
      const leaveNote =
        mode === "work" && result.preservedLeave > 0
          ? `，已保留 ${result.preservedLeave} 人休假`
          : "";
      const shiftNote = mode === "work" ? `（${shiftLabel}）` : "";
      setHolidayOneClickMessage(
        `${date} 已更新 ${result.updated} 人班表${shiftNote}${leaveNote}`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "國定假日一鍵設定失敗");
    } finally {
      setHolidayOneClickBusy(null);
    }
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const toggleMonthLock = async () => {
    if (!currentUser || !canManageSite(currentUser.role)) return;
    if (lockingMonth) return;
    setLockingMonth(true);
    try {
      if (monthLocked) {
        await unlockLeaveMonth(year, month);
      } else {
        await lockLeaveMonth(year, month, currentUser.id);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "班表鎖定操作失敗");
    } finally {
      setLockingMonth(false);
    }
  };

  const handleExportPdf = async (layout: ExportLayout) => {
    // 創建一個包裝函數，在匯出時考慮請假和加班
    const getShiftForDateWithLeave = (date: string, employeeId: string): ScheduleShiftCode => {
      const shift = getShiftForDate(date, employeeId);
      
      // 檢查是否有核准的請假申請
      const approvedLeave = leaveRequests.find(
        (req) =>
          req.employeeId === employeeId &&
          req.startDate <= date &&
          req.endDate >= date &&
          req.status === "approved"
      );

      if (approvedLeave) {
        return "X";
      }

      return shift;
    };

    await exportSchedulePdf({
      year,
      month,
      daysInMonth,
      employees: displayEmployees.map((e) => ({ id: e.id, name: e.name })),
      getShiftForDate: getShiftForDateWithLeave,
      getHolidayInfo,
      layout,
      shiftDisplayConfig,
      storeConfig,
      leaveRequests,
      overtimeRequests,
      typhoonDates,
    });
    setShowExportModal(false);
  };

  // 獲取員工在特定日期的請假或加班資訊
  const getEmployeeShiftInfo = (date: string, employeeId: string) => {
    const originalShift = getShiftForDate(date, employeeId);

    const approvedLeave = leaveRequests.find(
      (req) =>
        req.employeeId === employeeId &&
        req.startDate <= date &&
        req.endDate >= date &&
        req.status === "approved"
    );

    const approvedOvertime = overtimeRequests.find(
      (req) =>
        req.employeeId === employeeId &&
        req.date === date &&
        req.status === "approved"
    );

    if (!approvedLeave) {
      return {
        originalShift,
        effectiveShift: originalShift,
        effectiveShiftDetails: "",
        hasLeave: false,
        isPartialLeave: false,
        hasOvertime: !!approvedOvertime,
        leaveType: undefined,
        leaveStartTime: undefined,
        leaveEndTime: undefined,
        overtimeInfo: approvedOvertime
          ? { startTime: approvedOvertime.startTime, endTime: approvedOvertime.endTime }
          : null,
      };
    }

    const baseShift = getOriginalShiftForLeaveDay({
      employeeId,
      date,
      shiftMode: approvedLeave.shiftMode,
      scheduleSnapshot: approvedLeave.scheduleSnapshot,
      getBaseShiftForDate,
    });
    const leaveDisplay = calculateLeaveDisplayOnSchedule(
      baseShift,
      approvedLeave.period,
      approvedLeave.startTime,
      approvedLeave.endTime
    );

    return {
      originalShift: baseShift,
      effectiveShift: leaveDisplay.effectiveShift,
      effectiveShiftDetails: leaveDisplay.effectiveShiftDetails,
      hasLeave: true,
      isPartialLeave: leaveDisplay.isPartialLeave,
      hasOvertime: !!approvedOvertime,
      leaveType: approvedLeave.type,
      leaveStartTime: leaveDisplay.leaveStartTime,
      leaveEndTime: leaveDisplay.leaveEndTime,
      overtimeInfo: approvedOvertime
        ? { startTime: approvedOvertime.startTime, endTime: approvedOvertime.endTime }
        : null,
    };
  };

  const dateModalWorkers = selectedDate
    ? displayEmployees.map((emp) => {
        const shiftInfo = getEmployeeShiftInfo(selectedDate, emp.id);
        return {
          id: emp.id,
          name: emp.name,
          shift: shiftInfo.hasLeave ? shiftInfo.effectiveShift : shiftInfo.originalShift,
          shiftInfo,
        };
      })
    : [];
  const selectedDateWarnings = selectedDate
    ? (() => {
        const leaveWorkers = dateModalWorkers.filter((worker) => worker.shift === "X");
        const warnings: string[] = [];

        if (isSaturday(selectedDate)) {
          const working = dateModalWorkers.filter((worker) => worker.shift !== "X");
          const morning = dateModalWorkers.filter((worker) =>
            useCatalog
              ? styleOf(worker.shift).label.includes("白") || worker.shift.includes("白")
              : worker.shift === "C"
          );
          if (morning.length === 0 && !useCatalog) {
            warnings.push(`沒有人上${formatShiftName(shiftDisplayConfig, "C", storeConfig)}`);
          }
          if (working.length === 0) {
            warnings.push("禮拜六無人上班");
          } else if (working.length < 2) {
            warnings.push(
              `僅 ${working.map((w) => w.name).join("、")} 上班，禮拜六至少需要 2 人`
            );
          }
        } else if (!isSunday(selectedDate)) {
          const eveningShifts: ScheduleShiftCode[] = useCatalog
            ? storeConfig.shiftCatalog
                .filter((s) => s.enabled && (s.category === "night" || s.category === "all_day"))
                .map((s) => s.code)
            : ["A", "D", "E"];
          const eveningWorkers = dateModalWorkers.filter((worker) =>
            eveningShifts.includes(worker.shift)
          );
          if (eveningShifts.length > 0 && eveningWorkers.length < 2) {
            warnings.push(`晚班人數不足（目前 ${eveningWorkers.length} 人）`);
          }
          if (!useCatalog) {
            const aShiftWorkers = dateModalWorkers.filter((worker) => worker.shift === "A");
            if (aShiftWorkers.length === 0) {
              warnings.push(`${formatShiftName(shiftDisplayConfig, "A", storeConfig)}無人`);
            }
          }
        }

        if (leaveWorkers.length > 1) {
          warnings.push(`多人同日排休：${leaveWorkers.map((w) => w.name).join("、")}`);
        }
        return warnings;
      })()
    : [];

  // 檢查是否可以編輯
  const canEdit = (employeeId: string, dateStr: string): boolean => {
    if (!currentUser) return false;
    if (isPastDate(dateStr)) return false;
    if (isSunday(dateStr)) return false;
    if (canManageSite(currentUser.role)) return true;
    return false;
  };

  // 開始編輯
  const startEditing = (date: string, employeeId: string) => {
    if (canEdit(employeeId, date)) {
      setEditingCell({ date, employeeId });
    }
  };

  // 選擇班別
  const selectShift = async (date: string, employeeId: string, shift: ScheduleShiftCode) => {
    try {
      await updateShift(date, employeeId, shift);
      setEditingCell(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "班表更新失敗");
    }
  };

  // 班表單元格
  const ShiftCell = ({ date, employeeId, shift }: { date: string; employeeId: string; shift: ScheduleShiftCode }) => {
    const isEditing = editingCell?.date === date && editingCell?.employeeId === employeeId;
    const editable = canEdit(employeeId, date);
    const holidayInfo = getHolidayInfo(date);
    const isSun = isSunday(date);
    const shiftInfo = getEmployeeShiftInfo(date, employeeId);
    const displayShift = shiftInfo.hasLeave ? shiftInfo.effectiveShift : shift;
    const isFullDayLeave = shiftInfo.hasLeave && shiftInfo.effectiveShift === "X";
    const isPartialLeave = shiftInfo.isPartialLeave;
    const wednesdayNightShift = wednesdayNightShifts.find(s => s.date === date && s.employeeId === employeeId);
    const dayOfWeek = new Date(date).getDay();
    const hasFixedShift = fixedShifts.some(f => f.employeeId === employeeId && f.dayOfWeek === dayOfWeek);

    if (isEditing) {
      return (
        <div className="p-1">
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {shiftOptions.map((s) => {
              const style = styleOf(s);
              return (
              <button
                key={s}
                onClick={() => selectShift(date, employeeId, s)}
                style={{
                  backgroundColor: style.bgColor,
                  color: style.textColor,
                  borderColor: style.borderColor,
                }}
                className="text-xs px-1 py-0.5 rounded border hover:opacity-80 text-left"
                title={style.label}
              >
                {useCatalog ? style.label : style.displayText}
              </button>
              );
            })}
            <button
              onClick={() => setEditingCell(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              取消
            </button>
          </div>
        </div>
      );
    }

    const cellStyle = styleOf(displayShift);
    const cellText = isFullDayLeave ? "假" : cellStyle.displayText;

    return (
      <div className="p-1 relative overflow-visible">
        <div
          onClick={() => editable && startEditing(date, employeeId)}
          style={
            isFullDayLeave
              ? undefined
              : {
                  backgroundColor: cellStyle.bgColor,
                  color: cellStyle.textColor,
                  borderColor: cellStyle.borderColor,
                }
          }
          className={`relative z-0 hover:z-20 h-10 w-full min-w-[2.75rem] max-w-[4.5rem] mx-auto flex items-center justify-center overflow-visible rounded font-semibold border-2 ${isFullDayLeave ? "bg-violet-500 text-white border-violet-600" : ""} ${editable ? "cursor-pointer hover:opacity-80" : ""} ${isSun && !isFullDayLeave ? "bg-red-50" : ""} ${hasFixedShift ? "ring-2 ring-orange-400" : ""}`}
          title={
            isPartialLeave
              ? `半日請假：${shiftInfo.effectiveShiftDetails}`
              : `${cellStyle.label}${cellStyle.displayText !== cellStyle.label ? `（${cellStyle.displayText}）` : ""}`
          }
        >
          <span
            className={`whitespace-nowrap text-center text-sm leading-none ${
              editable ? "pr-2.5" : ""
            }`}
          >
            {cellText}
          </span>
          {editable && (
            <span
              aria-hidden
              className="pointer-events-none absolute right-0.5 bottom-0.5 text-[10px] leading-none opacity-70"
            >
              ✏️
            </span>
          )}
        </div>
        
        {/* 標記 */}
        {isPartialLeave && (
          <div
            className="absolute -top-1 -left-1 bg-amber-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center shadow z-10"
            title={`半日請假 ${shiftInfo.leaveStartTime}–${shiftInfo.leaveEndTime}`}
          >
            !
          </div>
        )}
        {isSun && displayShift === "X" && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            日
          </div>
        )}
        {!isSun && holidayInfo.isHoliday && (
          <div className="absolute -top-2 -right-2 bg-amber-300 text-amber-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow border border-amber-500 z-10">
            國
          </div>
        )}
        {wednesdayNightShift && (
          <div className="absolute -bottom-1 -right-1 bg-pink-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            晚
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <BulletinBoard />
        </div>
        <div className="space-y-6">
          <PersonalPayslip />
          
          {/* 原有的說明區移至此處 */}
          <HelpTip
            title="班表圖例說明"
            hint="固定班／假日／颱風等標記"
            storageKey={`help:schedule-legend:${storageScope}`}
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="app-legend-dot bg-orange-400"></div>
                <span>橘色框 - 固定班表（鎖定月份已快照，不受後續固定班調整影響）</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="app-legend-dot bg-red-500"></div>
                <span>禮拜日 - 不可編輯</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="app-legend-dot bg-amber-400"></div>
                <span>國定假日 - 可編輯／可一鍵設定</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="app-legend-dot bg-cyan-500"></div>
                <span>青色「颱」- 颱風／彈性出勤日</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="app-legend-dot bg-violet-500"></div>
                <span>紫色 - 當日請假</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="app-legend-dot bg-pink-500"></div>
                <span>
                  {storeConfig.features.rotationEvening
                    ? `${storeConfig.rotationEvening.menuLabel}輪流${
                        rotationEmployees.length > 0 ? `（${rotationLabel}）` : ""
                      }`
                    : "輪值晚班（本店未啟用）"}
                </span>
              </div>
            </div>
          </HelpTip>
        </div>
      </div>

      {isManager && (
        <FlexibleAttendancePanel
          onScheduleChanged={() => {
            void refreshSchedule();
            setTyphoonReloadKey((k) => k + 1);
          }}
        />
      )}

      {isManager && (
        <AutoRestPreviewPanel year={year} month={month} monthLocked={monthLocked} />
      )}

      {isManager && monthNationalHolidays.length > 0 && (
        <div className="app-card p-4 border-amber-200 bg-amber-50/40">
          <h3 className="app-section-title text-amber-900 mb-1">國定假日一鍵設定</h3>
          <p className="text-sm text-amber-800/80 mb-3">
            設為上班前可先選班別
            {useCatalog ? "（目錄班或依固定班）" : "（A–E，或依固定班）"}
            。已排休或全日請假的人維持休假。設為休假則全員 X（不寫入排休選擇）。
          </p>
          <div className="space-y-2">
            {monthNationalHolidays.map((h) => {
              const busyWork = holidayOneClickBusy === `${h.date}:work`;
              const busyOff = holidayOneClickBusy === `${h.date}:off`;
              const workShiftChoice = holidayWorkShiftByDate[h.date] ?? "auto";
              return (
                <div
                  key={h.date}
                  className="flex flex-wrap items-center gap-2 justify-between rounded-xl bg-white/90 border border-amber-100 px-3 py-2.5"
                >
                  <div className="text-sm text-slate-800">
                    <span className="font-medium">{month}/{h.day}</span>
                    <span className="ml-2 text-amber-800">{h.name}</span>
                    {h.isPast && <span className="ml-2 text-xs text-slate-400">已過</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-slate-600 flex items-center gap-1">
                      上班班別
                      <select
                        value={workShiftChoice}
                        disabled={h.isPast || Boolean(holidayOneClickBusy)}
                        onChange={(e) =>
                          setHolidayWorkShiftByDate((prev) => ({
                            ...prev,
                            [h.date]: e.target.value as HolidayWorkShiftChoice,
                          }))
                        }
                        className="border border-slate-200 rounded-xl px-2 py-1.5 text-xs bg-white disabled:opacity-50"
                      >
                        {holidayWorkShiftOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={h.isPast || Boolean(holidayOneClickBusy)}
                      onClick={() => void handleHolidayOneClick(h.date, "work", workShiftChoice)}
                      className="text-xs px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyWork ? "處理中…" : "一鍵設為上班"}
                    </button>
                    <button
                      type="button"
                      disabled={h.isPast || Boolean(holidayOneClickBusy)}
                      onClick={() => void handleHolidayOneClick(h.date, "off")}
                      className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-white disabled:opacity-50"
                    >
                      {busyOff ? "處理中…" : "一鍵設為休假"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {holidayOneClickMessage && (
            <p className="mt-2 text-sm text-emerald-700">{holidayOneClickMessage}</p>
          )}
        </div>
      )}

      {showExportModal && (
        <div className="app-modal-backdrop">
          <div className="app-panel shadow-xl p-6 max-w-md w-full app-rise-in">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">匯出班表 PDF</h3>
            <p className="text-sm text-slate-600 mb-4">請選擇版面。直式為 A4 直向，較適合列印；橫式維持原本寬版檢視。</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleExportPdf("landscape")}
                className="w-full px-4 py-3 border border-sky-200 rounded-xl hover:bg-sky-50 text-left transition-colors"
              >
                <span className="font-medium text-slate-900">橫式（寬版）</span>
                <span className="block text-xs text-slate-500 mt-1">員工為列、日期為欄，適合螢幕檢視</span>
              </button>
              <button
                onClick={() => handleExportPdf("portrait")}
                className="w-full px-4 py-3 border border-emerald-200 rounded-xl hover:bg-emerald-50 text-left transition-colors"
              >
                <span className="font-medium text-slate-900">直式（A4 列印用）</span>
                <span className="block text-xs text-slate-500 mt-1">上半月 1–15、下半月 16–月底，適合 A4 直向列印</span>
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-full px-4 py-2.5 app-btn-outline"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 頁頭 */}
      <div className="app-toolbar">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0 flex-1">
          <button onClick={prevMonth} className="app-btn-outline" aria-label="上個月">
            ◀
          </button>
          <h2 className="text-xl sm:text-2xl app-title whitespace-nowrap">{year}年{month}月 月曆式班表</h2>
          <button onClick={nextMonth} className="app-btn-outline" aria-label="下個月">
            ▶
          </button>
          <button onClick={() => setShowExportModal(true)} className="app-btn-primary">
            匯出班表
          </button>
          {(currentUser?.role === "owner" || currentUser?.role === "manager") && (
            <button
              onClick={toggleMonthLock}
              disabled={lockingMonth}
              className={monthLocked ? "app-btn-outline border-rose-300 text-rose-700 disabled:opacity-60" : "app-btn-outline disabled:opacity-60"}
            >
              {lockingMonth ? "處理中..." : monthLocked ? "解除本月班表鎖定" : "鎖定本月班表"}
            </button>
          )}
          {(currentUser?.role === "owner" || currentUser?.role === "manager") && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={2024}
                max={2100}
                value={holidayRefreshYear}
                onChange={(e) => setHolidayRefreshYear(Number(e.target.value) || year)}
                className="w-20 px-2 py-1.5 border border-slate-200 rounded-xl text-sm bg-white/90"
              />
              <button
                onClick={refreshHolidays}
                disabled={isRefreshingHolidays}
                className="app-btn-outline"
              >
                {isRefreshingHolidays ? "更新中..." : "更新假期"}
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {currentUser?.role === "owner" && <span className="app-chip text-sky-800 border-sky-100 bg-sky-50">可編輯所有人班表</span>}
          {currentUser?.role === "manager" && <span className="app-chip text-emerald-800 border-emerald-100 bg-emerald-50">可編輯班表與審核</span>}
          {currentUser?.role === "deputy" && <span className="app-chip text-cyan-800 border-cyan-100 bg-cyan-50">副店：功能同店長</span>}
          {currentUser?.role === "staff" && <span className="app-chip">僅檢視班表</span>}
          {monthLocked && <span className="app-chip text-rose-700 border-rose-100 bg-rose-50">本月已鎖定</span>}
          {viewingPastMonth && <span className="app-chip">過去月份僅供查閱</span>}
        </div>
        {holidayRefreshMessage && (
          <div className="w-full text-sm text-emerald-700">
            {holidayRefreshMessage}
          </div>
        )}
      </div>



      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="app-section-title">班表規則總覽</h3>
          {isManager && !isEditingNotes && (
            <button
              onClick={() => { setNotesDraft(schedulingNotes); setIsEditingNotes(true); }}
              className="app-btn-outline text-xs px-3 py-1.5"
            >
              編輯
            </button>
          )}
        </div>
        {isEditingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={6}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 resize-y bg-white/90"
              placeholder="每行一條規則說明..."
            />
            <div className="flex gap-2">
              <button onClick={saveNotes} className="app-btn-primary px-4 py-1.5 text-sm">儲存</button>
              <button onClick={() => setIsEditingNotes(false)} className="app-btn-outline px-4 py-1.5 text-sm">取消</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm text-slate-700">
            {schedulingNotes
              ? schedulingNotes.split("\n").filter(Boolean).map((line, i) => (
                  <p key={i}>• {line}</p>
                ))
              : <p className="text-slate-400 italic">尚未設定規則說明</p>
            }
          </div>
        )}
      </div>

      {/* 員工固定班表說明 */}
      <CollapsibleCard
        title="固定班表"
        subtitle={fixedShifts.length > 0 ? `${fixedShifts.length} 筆` : "尚無設定"}
        open={fixedShiftsOpen}
        onToggle={() => setFixedShiftsOpen((o) => !o)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {fixedShifts.map((fs, idx) => {
              const emp = employees.find(e => e.id === fs.employeeId);
              return (
                <div key={idx} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                  <span className="font-medium text-slate-800">{emp?.name}</span>
                  <p className="text-slate-600 text-xs mt-1">
                    每個 {dayLabels[fs.dayOfWeek]} - {styleOf(fs.shift).label}
                  </p>
                </div>
              );
            })}
            {fixedShifts.length === 0 && (
              <p className="text-slate-500">尚無固定班表設定</p>
            )}
        </div>
      </CollapsibleCard>

      {/* 週期輪值晚班 */}
      {storeConfig.features.rotationEvening && (
      <div className="app-card p-4">
        <h3 className="app-section-title mb-3">
          {storeConfig.rotationEvening.menuLabel}
          {rotationEmployees.length > 0 ? `（${rotationLabel}）` : "（尚未設定輪值人員）"}
        </h3>
        <div className="flex flex-wrap gap-2">
          {wednesdayNightShifts
            .filter(s => new Date(s.date).getMonth() + 1 === month && new Date(s.date).getFullYear() === year)
            .map((s) => {
              const emp = employees.find(e => e.id === s.employeeId);
              const date = new Date(s.date);
              return (
                <div key={s.date} className="rounded-xl border border-pink-100 bg-pink-50/80 p-2.5 min-w-[5.5rem]">
                  <div className="text-sm font-medium text-slate-900">{date.getMonth() + 1}/{date.getDate()}</div>
                  <div className="text-xs text-slate-600">{emp?.name}</div>
                  {rotationEmployees.length > 0 && (
                    <div className="text-[11px] text-slate-500 mt-1">
                      {rotationEmployees.map((rotationEmp, index) => (
                        <span key={rotationEmp.id}>
                          {index > 0 && " ・ "}
                          {rotationEmp.name}休：
                          {getWednesdayOffDates(rotationEmp.id, year, month).includes(s.date) ? "是" : "否"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          {rotationEmployees.length === 0 && (
            <p className="text-sm text-slate-500">
              請至「固定班表」啟用員工的{storeConfig.rotationEvening.menuLabel}輪值
            </p>
          )}
        </div>
      </div>
      )}

      {/* 本月資訊 */}
      <div className="app-card p-4">
        <h3 className="app-section-title mb-3">本月資訊</h3>
        <div className="text-sm text-slate-600">
          <p>本月有 {saturdayCount} 個禮拜六</p>
          {saturdayCount >= 5 && (
            <p className="text-violet-700 font-medium mt-1">
              第5個禮拜六 - 員工可選擇是否排休
            </p>
          )}
        </div>
      </div>

      {/* 人力班表提醒（與變形工時分開） */}
      <div
        className={`app-card p-4 ${
          hasStaffingAlerts
            ? "bg-amber-50/80 border-amber-200"
            : "bg-green-50/80 border-green-200"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-block h-3 w-3 rounded-full shrink-0 ${
              hasStaffingAlerts ? "bg-amber-500" : "bg-emerald-500"
            }`}
            aria-hidden
          />
          <h3
            className={`font-medium ${
              hasStaffingAlerts ? "text-amber-800" : "text-green-800"
            }`}
          >
            {hasStaffingAlerts ? "班表人力提醒" : "班表人力正常"}
          </h3>
        </div>
        {hasStaffingAlerts ? (
          <div className="space-y-2 text-sm text-amber-900">
            {scheduleWarnings.map((warning) => (
              <div key={warning.dateStr}>
                <span className="font-medium">
                  {month}/{warning.day}
                </span>
                ：{warning.messages.join("；")}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-green-800">
            綠燈：本月人力覆蓋檢查通過（全天／週六人數等無異常）。
          </p>
        )}
      </div>

      {/* 變形工時（獨立區塊，預設折疊） */}
      <div
        className={`${
          hasDeformedHoursAlerts
            ? "bg-amber-50/80 border-amber-200"
            : "bg-green-50/80 border-green-200"
        } app-card`}
      >
        {hasDeformedHoursAlerts ? (
          <CollapsibleCard
            className="p-4"
            contentClassName="mt-2 space-y-2"
            open={deformedHoursOpen}
            onToggle={() => setDeformedHoursOpen((o) => !o)}
            title={
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-block h-3 w-3 rounded-full shrink-0 bg-amber-500" aria-hidden />
                <span className="font-medium text-amber-900 text-sm">
                  變形工時（{workHoursRegimeMeta(storeConfig.workHoursRegime).label}，只算本月完整週期）
                </span>
              </div>
            }
            subtitle={`硬性風險 ${hardComplianceWarnings.length} 則／軟警示 ${softComplianceWarnings.length} 則（目前僅提醒不阻擋）`}
            buttonClassName="hover:bg-amber-100/50"
          >
            {hardComplianceWarnings.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-semibold text-rose-800 mb-1">硬性風險（優先處理）</p>
                <div className="space-y-1 text-sm text-rose-900">
                  {hardComplianceWarnings.map((w, i) => (
                    <div key={`${w.kind}-${i}`}>{w.message}</div>
                  ))}
                </div>
              </div>
            )}
            {softComplianceWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800 mb-1">軟性提醒</p>
                <div className="space-y-1 text-sm text-amber-900">
                  {softComplianceWarnings.map((w, i) => (
                    <div key={`${w.kind}-${i}`}>{w.message}</div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleCard>
        ) : (
          <div className="flex items-center gap-2 p-4">
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0 bg-emerald-500"
              aria-hidden
            />
            <div>
              <h3 className="font-medium text-green-800">
                變形工時正常
              </h3>
              <p className="text-sm text-green-800 mt-0.5">
                綠燈：{workHoursRegimeMeta(storeConfig.workHoursRegime).label}
                本月完整週期正常工時／單日上限／例假（每七日一例假）軟性檢查皆未超標。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 班表 */}
      <div className="app-card overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full app-table">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200/80">
                <th className="p-3 text-left text-sm font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10 w-24">
                  員工
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const date = new Date(dateStr);
                  const dayOfWeek = date.getDay();
                  const holidayInfo = getHolidayInfo(dateStr);
                  const isToday = dateStr === todayDateStr;
                  const typhoon = typhoonDates[dateStr];
                  
                  let headerClass = "";
                  if (typhoon) headerClass = "text-cyan-800 bg-cyan-100";
                  else if (dayOfWeek === 0) headerClass = "text-red-600 bg-red-50";
                  else if (dayOfWeek === 6) headerClass = "text-orange-600 bg-orange-50";
                  else if (holidayInfo.isHoliday) headerClass = "text-amber-800 bg-amber-50";
                  
                  return (
                    <th
                      key={day}
                      className={`p-2 text-center text-sm font-medium min-w-[56px] ${headerClass} ${isToday ? "bg-rose-100 border-x-2 border-rose-400" : ""} cursor-pointer hover:brightness-95 transition`}
                      onClick={() => setSelectedDate(dateStr)}
                      title={typhoon ? `${typhoon.title}（${typhoon.periodLabel}）` : "查看當日上班狀況"}
                    >
                      {isToday && <div className="text-xs font-extrabold text-rose-700">今</div>}
                      {typhoon && <div className="text-[10px] font-bold text-cyan-800">颱</div>}
                      <div>{day}</div>
                      <div className="text-xs text-slate-500">{dayLabels[dayOfWeek]}</div>
                      {typhoon && (
                        <div className="text-[10px] text-cyan-700 whitespace-pre-line">
                          {typhoon.periodLabel}
                        </div>
                      )}
                      {holidayInfo.isHoliday && !isSunday(dateStr) && !typhoon && (
                        <div className="text-[10px] text-amber-700 whitespace-pre-line">
                          {holidayInfo.name}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-sky-50/40">
                  <td className="p-3 text-left font-medium text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-100">
                    {emp.name}
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const shift = getShiftForDate(dateStr, emp.id);
                    const isToday = dateStr === todayDateStr;
                    const isTyphoon = Boolean(typhoonDates[dateStr]);
                    return (
                      <td key={day} className={`overflow-visible ${isSunday(dateStr) ? 'bg-red-50/30' : ''} ${isTyphoon ? 'bg-cyan-50/70 ring-1 ring-inset ring-cyan-200' : ''} ${isToday ? "bg-rose-50/80 border-x-2 border-rose-400" : ""}`}>
                        <ShiftCell date={dateStr} employeeId={emp.id} shift={shift} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 圖例 */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-slate-700">圖例：</span>
            {shiftOptions.map((shiftCode) => {
              const s = shiftCode;
              const style = styleOf(s);
              const ranges = rangesOf(s);
              const isActive = activeLegendShift === s;
              return (
                <button
                  key={shiftCode}
                  type="button"
                  className="relative flex items-center gap-2 text-sm"
                  onMouseEnter={() => setActiveLegendShift(s)}
                  onMouseLeave={() => setActiveLegendShift((prev) => (prev === s ? null : prev))}
                  onClick={() => setActiveLegendShift((prev) => (prev === s ? null : s))}
                >
                  <span
                    style={{
                      backgroundColor: style.bgColor,
                      color: style.textColor,
                      borderColor: style.borderColor,
                    }}
                    className="min-w-[2.75rem] max-w-[4.5rem] h-8 px-1 flex items-center justify-center overflow-visible rounded-lg border-2 font-semibold text-sm leading-none whitespace-nowrap shadow-sm"
                  >
                    {style.displayText}
                  </span>
                  <span className="text-slate-600">{style.label}</span>

                  {isActive && (
                    <span className="absolute left-0 bottom-10 z-30 min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs shadow-xl">
                      <span className="block font-semibold text-slate-800 mb-1">
                        {style.label}時段
                      </span>
                      {ranges.map((range) => (
                        <span key={range} className="block text-slate-600">
                          {range}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {useCatalog && (
            <p className="text-xs text-sky-800">
              集集班表可直接選目錄班別；請先在「店家設定」載入或維護班別目錄。
            </p>
          )}
        </div>
      </div>

      {selectedDate && (
        <div className="app-modal-backdrop">
          <div className="w-full max-w-lg app-panel shadow-2xl app-rise-in overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-gradient-to-r from-sky-50/80 to-white">
              <h3 className="text-lg font-semibold text-slate-900">
                {selectedDate} 當日上班狀況
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(null);
                  setShowOriginalShift(false);
                }}
                className="rounded-xl px-2.5 py-1.5 text-slate-500 hover:bg-sky-50 hover:text-slate-800"
              >
                關閉
              </button>
            </div>
            
            {/* 視圖切換按鈕 */}
            <div className="flex items-center justify-center gap-2 border-b border-slate-100 px-5 py-3 bg-slate-50/80">
              <button
                type="button"
                onClick={() => setShowOriginalShift(false)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  !showOriginalShift
                    ? "bg-sky-600 text-white shadow-sm"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-sky-50"
                }`}
              >
                顯示異動班表
              </button>
              <button
                type="button"
                onClick={() => setShowOriginalShift(true)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  showOriginalShift
                    ? "bg-sky-600 text-white shadow-sm"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-sky-50"
                }`}
              >
                查看原始班表
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-2">
              {selectedDateWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-2">
                  <p className="text-sm font-semibold text-amber-800 mb-1">人力警示</p>
                  <ul className="text-sm text-amber-900 space-y-1">
                    {selectedDateWarnings.map((warning) => (
                      <li key={warning}>- {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              {dateModalWorkers.map((worker) => {
                const { originalShift, effectiveShift, effectiveShiftDetails } = worker.shiftInfo;
                const hasLeave = worker.shiftInfo.hasLeave;

                const formatShiftLabel = (shift: ScheduleShiftCode) => {
                  if (!shift || shift === "X") return styleOf(shift || "X").label || "休假";
                  const st = styleOf(shift);
                  return useCatalog
                    ? `${st.label}（${rangesOf(shift).join("、") || "時段未設"}）`
                    : `${st.displayText}班（${st.label}）`;
                };

                return (
                  <div
                    key={worker.id}
                    className={`flex items-center justify-between rounded-xl border border-slate-200/80 p-3 ${
                      hasLeave && !showOriginalShift ? "bg-violet-50 border-violet-200" : "bg-white/80"
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-slate-800">{worker.name}</span>
                      {!showOriginalShift && hasLeave && (
                        <span className="text-xs text-violet-600">
                          請假：{worker.shiftInfo.leaveStartTime}-{worker.shiftInfo.leaveEndTime}
                          {worker.shiftInfo.leaveType && `（${worker.shiftInfo.leaveType}）`}
                          {effectiveShiftDetails === "全日請假" ? (
                            <span className="ml-1">（全日請假）</span>
                          ) : effectiveShiftDetails && effectiveShiftDetails !== "休假" ? (
                            <span className="ml-1">（實際上班：{effectiveShiftDetails}）</span>
                          ) : null}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!showOriginalShift && hasLeave && (
                        <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-medium">
                          假
                        </span>
                      )}
                      <span className="text-sm text-slate-600">
                        {showOriginalShift
                          ? formatShiftLabel(originalShift)
                          : hasLeave && effectiveShiftDetails === "全日請假"
                            ? "休假（全日請假）"
                            : formatShiftLabel(effectiveShift)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
