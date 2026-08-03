"use client";

import { useState, useEffect } from "react";
import { useApp, type ShiftType } from "@/lib/context/AppContext";
import { exportSchedulePdf, type ExportLayout } from "@/lib/schedule/exportSchedulePdf";
import { buildScheduleWarnings } from "@/lib/schedule/scheduleWarnings";
import { formatShiftName } from "@/lib/schedule/shiftLabels";
import { isPastDate, isPastMonth } from "@/lib/schedule/monthAccess";
import { calculateLeaveDisplayOnSchedule, getOriginalShiftForLeaveDay } from "@/lib/schedule/leaveSchedule";
import { createClient } from "@/lib/supabase/client";
import BulletinBoard from "@/components/BulletinBoard";
import PersonalPayslip from "@/components/PersonalPayslip";
import FlexibleAttendancePanel from "@/components/FlexibleAttendancePanel";

const shiftOptions: ShiftType[] = ["A", "B", "C", "D", "E", "X"];

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
  const [editingCell, setEditingCell] = useState<{ date: string; employeeId: string } | null>(null);

  // 班表規則說明（可編輯）
  const supabase = createClient();
  const [schedulingNotes, setSchedulingNotes] = useState("");
  const [notesId, setNotesId] = useState<string | null>(null);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    supabase.from("scheduling_notes").select("id, content").limit(1).single()
      .then(({ data }) => {
        if (data) {
          setSchedulingNotes(data.content);
          setNotesId(data.id);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNotes = async () => {
    if (notesId) {
      await supabase.from("scheduling_notes")
        .update({ content: notesDraft, updated_by: currentUser?.id })
        .eq("id", notesId);
    } else {
      const { data } = await supabase.from("scheduling_notes")
        .insert({ content: notesDraft, updated_by: currentUser?.id })
        .select().single();
      if (data) setNotesId(data.id);
    }
    setSchedulingNotes(notesDraft);
    setIsEditingNotes(false);
  };
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showOriginalShift, setShowOriginalShift] = useState(false); // 新增：是否顯示原始班表
  const [activeLegendShift, setActiveLegendShift] = useState<ShiftType | null>(null);
  const [lockingMonth, setLockingMonth] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [typhoonDates, setTyphoonDates] = useState<Record<string, { title: string; periodLabel: string }>>({});
  const [typhoonReloadKey, setTyphoonReloadKey] = useState(0);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("flexible_attendance_days")
        .select("day_date, title, period_mode, from_time, status")
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
  }, [supabase, year, month, daysInMonth, typhoonReloadKey]);

  const saturdayCount = countSaturdaysInMonth(year, month);
  const monthLocked = isLeaveMonthLocked(year, month);
  const viewingPastMonth = isPastMonth(year, month);
  const scheduleWarnings = buildScheduleWarnings({
    year,
    month,
    daysInMonth,
    employees,
    shiftDisplayConfig,
    getShiftForDate,
  });
  const today = new Date();
  const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    setHolidayRefreshYear(year);
  }, [year]);

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

  // 過濾掉老闆（不顯示在班表）
  const displayEmployees = employees.filter(e => e.role !== "owner");
  const rotationEmployees = employees.filter((e) => e.isWednesdayRotation);
  const rotationLabel =
    rotationEmployees.length > 0
      ? rotationEmployees.map((e) => e.name).join("/")
      : "尚未設定";
  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";

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

  const handleHolidayOneClick = async (date: string, mode: "work" | "off") => {
    if (!isManager || holidayOneClickBusy) return;
    const label = mode === "work" ? "設為上班（已排休／全日請假維持休假）" : "設為全員休假";
    if (!window.confirm(`確定對 ${date} ${label}？`)) return;

    setHolidayOneClickBusy(`${date}:${mode}`);
    setHolidayOneClickMessage(null);
    try {
      const result = await applyNationalHolidayOneClick(date, mode);
      await refreshSchedule();
      const leaveNote =
        mode === "work" && result.preservedLeave > 0
          ? `，已保留 ${result.preservedLeave} 人休假`
          : "";
      setHolidayOneClickMessage(
        `${date} 已更新 ${result.updated} 人班表${leaveNote}`
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
    if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "manager")) return;
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
    const getShiftForDateWithLeave = (date: string, employeeId: string): ShiftType => {
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
          const morning = dateModalWorkers.filter((worker) => worker.shift === "C");
          if (morning.length === 0) {
            warnings.push(`沒有人上${formatShiftName(shiftDisplayConfig, "C")}`);
          }
          if (working.length === 0) {
            warnings.push("禮拜六無人上班");
          } else if (working.length < 2) {
            warnings.push(
              `僅 ${working.map((w) => w.name).join("、")} 上班，禮拜六至少需要 2 人`
            );
          }
        } else if (!isSunday(selectedDate)) {
          const eveningShifts: ShiftType[] = ["A", "D", "E"];
          const eveningWorkers = dateModalWorkers.filter((worker) =>
            eveningShifts.includes(worker.shift)
          );
          const aShiftWorkers = dateModalWorkers.filter((worker) => worker.shift === "A");
          if (eveningWorkers.length < 2) {
            warnings.push(`晚班人數不足（目前 ${eveningWorkers.length} 人）`);
          }
          if (aShiftWorkers.length === 0) {
            warnings.push(`${formatShiftName(shiftDisplayConfig, "A")}無人`);
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
    if (currentUser.role === "owner") return true;
    if (currentUser.role === "manager") return true;
    return false;
  };

  // 開始編輯
  const startEditing = (date: string, employeeId: string) => {
    if (canEdit(employeeId, date)) {
      setEditingCell({ date, employeeId });
    }
  };

  // 選擇班別
  const selectShift = async (date: string, employeeId: string, shift: ShiftType) => {
    try {
      await updateShift(date, employeeId, shift);
      setEditingCell(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "班表更新失敗");
    }
  };

  // 班表單元格
  const ShiftCell = ({ date, employeeId, shift }: { date: string; employeeId: string; shift: ShiftType }) => {
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
          <div className="flex flex-col gap-1">
            {shiftOptions.map((s) => (
              <button
                key={s}
                onClick={() => selectShift(date, employeeId, s)}
                style={{
                  backgroundColor: shiftDisplayConfig[s].bgColor,
                  color: shiftDisplayConfig[s].textColor,
                  borderColor: shiftDisplayConfig[s].borderColor,
                }}
                className="text-xs px-1 py-0.5 rounded border hover:opacity-80"
              >
                {shiftDisplayConfig[s].displayText}
              </button>
            ))}
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

    return (
      <div className="p-1 relative">
        <div
          onClick={() => editable && startEditing(date, employeeId)}
          style={
            isFullDayLeave
              ? undefined
              : {
                  backgroundColor: shiftDisplayConfig[displayShift].bgColor,
                  color: shiftDisplayConfig[displayShift].textColor,
                  borderColor: shiftDisplayConfig[displayShift].borderColor,
                }
          }
          className={`h-10 flex items-center justify-center rounded font-medium border-2 ${isFullDayLeave ? "bg-violet-500 text-white border-violet-600" : ""} ${editable ? "cursor-pointer hover:opacity-80" : ""} ${isSun && !isFullDayLeave ? "bg-red-50" : ""} ${hasFixedShift ? "ring-2 ring-orange-400" : ""}`}
          title={isPartialLeave ? `半日請假：${shiftInfo.effectiveShiftDetails}` : undefined}
        >
          {isFullDayLeave ? "假" : shiftDisplayConfig[displayShift].displayText}
          {editable && <span className="ml-1 text-[10px]">✏️</span>}
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
          <div className="app-card bg-blue-50/80 border-blue-200 p-4">
            <h3 className="font-medium text-blue-800 mb-3">📋 說明</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-400"></div>
                <span className="text-gray-600">橘色框 - 固定班表（鎖定月份已快照，不受後續固定班調整影響）</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-gray-600">禮拜日 - 不可編輯</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-gray-600">國定假日 - 可編輯／可一鍵設定</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                <span className="text-gray-600">青色「颱」- 颱風／彈性出勤日</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-violet-500"></div>
                <span className="text-gray-600">紫色 - 當日請假</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                <span className="text-gray-600">
                  禮拜三晚班輪流{rotationEmployees.length > 0 ? `（${rotationLabel}）` : ""}
                </span>
              </div>
            </div>
          </div>
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

      {isManager && monthNationalHolidays.length > 0 && (
        <div className="app-card p-4 border-amber-200 bg-amber-50/40">
          <h3 className="font-medium text-amber-900 mb-1">國定假日一鍵設定</h3>
          <p className="text-sm text-amber-800/80 mb-3">
            店長決定當日是否營業：設為上班會依固定班／基準班排班；已排休或全日請假的人維持休假。設為休假則全員 X（不寫入排休選擇）。
          </p>
          <div className="space-y-2">
            {monthNationalHolidays.map((h) => {
              const busyWork = holidayOneClickBusy === `${h.date}:work`;
              const busyOff = holidayOneClickBusy === `${h.date}:off`;
              return (
                <div
                  key={h.date}
                  className="flex flex-wrap items-center gap-2 justify-between rounded-lg bg-white/80 border border-amber-100 px-3 py-2"
                >
                  <div className="text-sm text-gray-800">
                    <span className="font-medium">{month}/{h.day}</span>
                    <span className="ml-2 text-amber-800">{h.name}</span>
                    {h.isPast && <span className="ml-2 text-xs text-gray-400">已過</span>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={h.isPast || Boolean(holidayOneClickBusy)}
                      onClick={() => void handleHolidayOneClick(h.date, "work")}
                      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyWork ? "處理中…" : "一鍵設為上班"}
                    </button>
                    <button
                      type="button"
                      disabled={h.isPast || Boolean(holidayOneClickBusy)}
                      onClick={() => void handleHolidayOneClick(h.date, "off")}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">匯出班表 PDF</h3>
            <p className="text-sm text-gray-600 mb-4">請選擇版面。直式為 A4 直向，較適合列印；橫式維持原本寬版檢視。</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleExportPdf("landscape")}
                className="w-full px-4 py-3 border-2 border-blue-200 rounded-lg hover:bg-blue-50 text-left"
              >
                <span className="font-medium text-gray-900">橫式（寬版）</span>
                <span className="block text-xs text-gray-500 mt-1">員工為列、日期為欄，適合螢幕檢視</span>
              </button>
              <button
                onClick={() => handleExportPdf("portrait")}
                className="w-full px-4 py-3 border-2 border-emerald-200 rounded-lg hover:bg-emerald-50 text-left"
              >
                <span className="font-medium text-gray-900">直式（A4 列印用）</span>
                <span className="block text-xs text-gray-500 mt-1">上半月 1–15、下半月 16–月底，適合 A4 直向列印</span>
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 頁頭 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <button onClick={prevMonth} className="app-btn-outline">
            ◀
          </button>
          <h2 className="text-2xl app-title">{year}年{month}月 班表</h2>
          <button onClick={nextMonth} className="app-btn-outline">
            ▶
          </button>
          <button onClick={() => setShowExportModal(true)} className="app-btn-primary">
            匯出班表
          </button>
          {(currentUser?.role === "owner" || currentUser?.role === "manager") && (
            <button
              onClick={toggleMonthLock}
              disabled={lockingMonth}
              className={monthLocked ? "app-btn-outline border-red-300 text-red-700 disabled:opacity-60" : "app-btn-outline disabled:opacity-60"}
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
                className="w-20 px-2 py-1 border rounded-lg text-sm"
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
        <div className="text-sm text-gray-600">
          {currentUser?.role === "owner" && <span className="text-blue-600">👑 您可以編輯所有人的班表</span>}
          {currentUser?.role === "manager" && <span className="text-green-600">👔 您可以編輯所有人的班表與審核申請</span>}
          {currentUser?.role === "staff" && <span className="text-gray-500">👤 僅檢視班表</span>}
          {monthLocked && <span className="ml-3 text-red-600 font-medium">🔒 本月班表已鎖定（員工無法改排休；店長可調班表；請假／換班／加班仍可申請）</span>}
          {viewingPastMonth && <span className="ml-3 text-gray-600 font-medium">📅 已過去的月份僅供查閱，無法修改班表或申請</span>}
        </div>
        {holidayRefreshMessage && (
          <div className="mt-2 text-sm text-emerald-700">
            {holidayRefreshMessage}
          </div>
        )}
      </div>



      <div className="app-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">📌 班表規則總覽</h3>
          {isManager && !isEditingNotes && (
            <button
              onClick={() => { setNotesDraft(schedulingNotes); setIsEditingNotes(true); }}
              className="text-xs px-3 py-1 border rounded-lg text-gray-600 hover:bg-gray-50"
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
              className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 resize-y"
              placeholder="每行一條規則說明..."
            />
            <div className="flex gap-2">
              <button onClick={saveNotes} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">儲存</button>
              <button onClick={() => setIsEditingNotes(false)} className="px-4 py-1.5 border text-sm rounded-lg">取消</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm text-gray-700">
            {schedulingNotes
              ? schedulingNotes.split("\n").filter(Boolean).map((line, i) => (
                  <p key={i}>• {line}</p>
                ))
              : <p className="text-gray-400 italic">尚未設定規則說明</p>
            }
          </div>
        )}
      </div>

      {/* 員工固定班表說明 */}
      <div className="app-card p-4">
        <h3 className="font-medium text-gray-900 mb-3">📅 固定班表</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          {fixedShifts.map((fs, idx) => {
            const emp = employees.find(e => e.id === fs.employeeId);
            return (
              <div key={idx} className="border rounded-lg p-2">
                <span className="font-medium text-gray-800">{emp?.name}</span>
                <p className="text-gray-600 text-xs mt-1">
                  每個 {dayLabels[fs.dayOfWeek]} - {shiftDisplayConfig[fs.shift].label}
                </p>
              </div>
            );
          })}
          {fixedShifts.length === 0 && (
            <p className="text-gray-500">尚無固定班表設定</p>
          )}
        </div>
      </div>

      {/* 禮拜三輪流晚班 */}
      <div className="app-card p-4">
        <h3 className="font-medium text-gray-900 mb-3">
          🌙 禮拜三晚班輪流{rotationEmployees.length > 0 ? `（${rotationLabel}）` : "（尚未設定輪值人員）"}
        </h3>
        <div className="flex flex-wrap gap-2">
          {wednesdayNightShifts
            .filter(s => new Date(s.date).getMonth() + 1 === month && new Date(s.date).getFullYear() === year)
            .map((s) => {
              const emp = employees.find(e => e.id === s.employeeId);
              const date = new Date(s.date);
              return (
                <div key={s.date} className="border rounded-lg p-2 bg-pink-50">
                  <div className="text-sm font-medium">{date.getMonth() + 1}/{date.getDate()}</div>
                  <div className="text-xs text-gray-600">{emp?.name}</div>
                  {rotationEmployees.length > 0 && (
                    <div className="text-[11px] text-gray-500 mt-1">
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
            <p className="text-sm text-gray-500">請至「固定班表」啟用員工的禮拜三晚班輪值</p>
          )}
        </div>
      </div>

      {/* 本月資訊 */}
      <div className="app-card p-4">
        <h3 className="font-medium text-gray-900 mb-3">📊 本月資訊</h3>
        <div className="text-sm text-gray-600">
          <p>本月有 {saturdayCount} 個禮拜六</p>
          {saturdayCount >= 5 && (
            <p className="text-purple-600 font-medium mt-1">
              ⚠️ 第5個禮拜六 - 員工可選擇是否排休
            </p>
          )}
        </div>
      </div>

      <div
        className={`app-card p-4 ${
          scheduleWarnings.length > 0
            ? "bg-amber-50/80 border-amber-200"
            : "bg-green-50/80 border-green-200"
        }`}
      >
        <h3
          className={`font-medium mb-3 ${
            scheduleWarnings.length > 0 ? "text-amber-800" : "text-green-800"
          }`}
        >
          {scheduleWarnings.length > 0 ? "⚠️ 班表提醒" : "✅ 班表提醒"}
        </h3>
        {scheduleWarnings.length > 0 ? (
          <div className="space-y-2 text-sm text-amber-900">
            {scheduleWarnings.map((warning) => (
              <div key={warning.dateStr}>
                <span className="font-medium">{month}/{warning.day}</span>：
                {warning.messages.join("；")}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-green-800">
            本月排班檢查無異常：全天班有人值班、禮拜六至少 2 人上班，目前沒有衝突。
          </p>
        )}
      </div>

      {/* 班表 */}
      <div className="app-card overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full app-table">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="p-3 text-left text-sm font-medium text-gray-700 sticky left-0 bg-gray-50 z-10 w-24">
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
                  else if (holidayInfo.isHoliday) headerClass = "text-yellow-700 bg-yellow-50";
                  
                  return (
                    <th
                      key={day}
                      className={`p-2 text-center text-sm font-medium min-w-[48px] ${headerClass} ${isToday ? "bg-red-100 border-x-4 border-red-500" : ""} cursor-pointer hover:brightness-95 transition`}
                      onClick={() => setSelectedDate(dateStr)}
                      title={typhoon ? `${typhoon.title}（${typhoon.periodLabel}）` : "查看當日上班狀況"}
                    >
                      {isToday && <div className="text-[10px] font-bold text-red-700">今</div>}
                      {typhoon && <div className="text-[10px] font-bold text-cyan-800">颱</div>}
                      <div>{day}</div>
                      <div className="text-xs text-gray-500">{dayLabels[dayOfWeek]}</div>
                      {typhoon && (
                        <div className="text-[10px] text-cyan-700 whitespace-pre-line">
                          {typhoon.periodLabel}
                        </div>
                      )}
                      {holidayInfo.isHoliday && !isSunday(dateStr) && !typhoon && (
                        <div className="text-[10px] text-yellow-700 whitespace-pre-line">
                          {holidayInfo.name}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="p-3 text-left font-medium text-gray-900 sticky left-0 bg-white z-10 border-r">
                    {emp.name}
                    {emp.role === "manager" && (
                      <span className="text-xs text-blue-600 ml-1">(店長)</span>
                    )}
                  </td>
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const shift = getShiftForDate(dateStr, emp.id);
                    const isToday = dateStr === todayDateStr;
                    const isTyphoon = Boolean(typhoonDates[dateStr]);
                    return (
                      <td key={day} className={`${isSunday(dateStr) ? 'bg-red-50/30' : ''} ${isTyphoon ? 'bg-cyan-50/70 ring-1 ring-inset ring-cyan-200' : ''} ${isToday ? "bg-red-50 border-x-4 border-red-500" : ""}`}>
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
        <div className="p-4 border-t bg-gray-50">
          <div className="flex flex-wrap items-center gap-6">
            <span className="text-sm font-medium text-gray-700">圖例：</span>
            {shiftOptions.map((shiftCode) => {
              const s = shiftCode as ShiftType;
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
                      backgroundColor: shiftDisplayConfig[s].bgColor,
                      color: shiftDisplayConfig[s].textColor,
                      borderColor: shiftDisplayConfig[s].borderColor,
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded border-2 font-medium"
                  >
                    {shiftDisplayConfig[s].displayText}
                  </span>
                  <span className="text-gray-600">{shiftDisplayConfig[s].label}</span>

                  {isActive && (
                    <span className="absolute left-0 bottom-10 z-30 min-w-[170px] rounded-lg border bg-white px-3 py-2 text-left text-xs shadow-xl">
                      <span className="block font-semibold text-gray-800 mb-1">
                        {shiftDisplayConfig[s].displayText}班時段
                      </span>
                      {shiftTimeConfig[s].map((range) => (
                        <span key={range} className="block text-gray-600">
                          {range}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedDate} 當日上班狀況
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(null);
                  setShowOriginalShift(false);
                }}
                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                關閉
              </button>
            </div>
            
            {/* 視圖切換按鈕 */}
            <div className="flex items-center justify-center gap-2 border-b px-5 py-3 bg-gray-50">
              <button
                type="button"
                onClick={() => setShowOriginalShift(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !showOriginalShift
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                }`}
              >
                顯示異動班表
              </button>
              <button
                type="button"
                onClick={() => setShowOriginalShift(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showOriginalShift
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                }`}
              >
                查看原始班表
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-2">
              {selectedDateWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-2">
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

                const formatShiftLabel = (shift: ShiftType) => {
                  if (!shift || shift === "X") return shiftDisplayConfig[shift]?.label || "休假";
                  return `${shiftDisplayConfig[shift].displayText}班（${shiftDisplayConfig[shift].label}）`;
                };

                return (
                  <div
                    key={worker.id}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      hasLeave && !showOriginalShift ? "bg-violet-50 border-violet-200" : ""
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-gray-800">{worker.name}</span>
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
                        <span className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700 font-medium">
                          假
                        </span>
                      )}
                      <span className="text-sm text-gray-600">
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
