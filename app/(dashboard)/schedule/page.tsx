"use client";

import { useState, useEffect } from "react";
import { useApp, type ShiftType } from "@/lib/context/AppContext";
import { exportSchedulePdf, type ExportLayout } from "@/lib/schedule/exportSchedulePdf";
import { createClient } from "@/lib/supabase/client";
import BulletinBoard from "@/components/BulletinBoard";
import PersonalPayslip from "@/components/PersonalPayslip";

// 班別顏色設定
const shiftColors: Record<ShiftType, { bg: string; text: string; border: string }> = {
  A: { bg: "bg-blue-200", text: "text-blue-900", border: "border-blue-400" },
  B: { bg: "bg-emerald-200", text: "text-emerald-900", border: "border-emerald-400" },
  C: { bg: "bg-amber-200", text: "text-amber-900", border: "border-amber-400" },
  D: { bg: "bg-violet-200", text: "text-violet-900", border: "border-violet-400" },
  E: { bg: "bg-rose-200", text: "text-rose-900", border: "border-rose-400" },
  X: { bg: "bg-slate-200", text: "text-slate-700", border: "border-slate-400" },
};

const shiftLabels: Record<ShiftType, string> = {
  A: "全天",
  B: "白班",
  C: "上午",
  D: "下午",
  E: "下午+晚",
  X: "休假",
};

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
    getWednesdayOffDates,
    shiftTimeConfig,
    isLeaveMonthLocked,
    lockLeaveMonth,
    unlockLeaveMonth,
    leaveRequests,
    overtimeRequests,
  } = useApp();
  
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 1));
  const [holidayRefreshYear, setHolidayRefreshYear] = useState<number>(new Date().getFullYear());
  const [isRefreshingHolidays, setIsRefreshingHolidays] = useState(false);
  const [holidayRefreshMessage, setHolidayRefreshMessage] = useState<string | null>(null);
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
  const [activeLegendShift, setActiveLegendShift] = useState<ShiftType | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const saturdayCount = countSaturdaysInMonth(year, month);
  const monthLocked = isLeaveMonthLocked(year, month);
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
  const isManager = currentUser?.role === "owner" || currentUser?.role === "manager";

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const toggleMonthLock = async () => {
    if (!currentUser || (currentUser.role !== "owner" && currentUser.role !== "manager")) return;
    if (monthLocked) {
      await unlockLeaveMonth(year, month);
      return;
    }
    await lockLeaveMonth(year, month, currentUser.id);
  };

  const handleExportPdf = async (layout: ExportLayout) => {
    await exportSchedulePdf({
      year,
      month,
      daysInMonth,
      employees: displayEmployees.map((e) => ({ id: e.id, name: e.name })),
      getShiftForDate,
      getHolidayInfo,
      layout,
      leaveRequests,
      overtimeRequests,
    });
    setShowExportModal(false);
  };

  const dateModalWorkers = selectedDate
    ? displayEmployees.map((emp) => ({
        id: emp.id,
        name: emp.name,
        shift: getShiftForDate(selectedDate, emp.id),
      }))
    : [];
  const selectedDateWarnings = selectedDate
    ? (() => {
        const eveningShifts: ShiftType[] = ["A", "D", "E"];
        const eveningWorkers = dateModalWorkers.filter((worker) => eveningShifts.includes(worker.shift));
        const leaveWorkers = dateModalWorkers.filter((worker) => worker.shift === "X");
        const aShiftWorkers = dateModalWorkers.filter((worker) => worker.shift === "A");
        const warnings: string[] = [];
        if (eveningWorkers.length < 2) {
          warnings.push(`晚班人數不足（目前 ${eveningWorkers.length} 人）`);
        }
        if (aShiftWorkers.length === 0) {
          warnings.push("A 班無人");
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
    if (isSunday(dateStr)) return false; // 禮拜日不能編輯
    if (currentUser.role === "owner") return true; // 老闆可以編輯所有人
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
  const selectShift = (date: string, employeeId: string, shift: ShiftType) => {
    updateShift(date, employeeId, shift);
    setEditingCell(null);
  };

  // 班表單元格
  const ShiftCell = ({ date, employeeId, shift }: { date: string; employeeId: string; shift: ShiftType }) => {
    const colors = shiftColors[shift];
    const isEditing = editingCell?.date === date && editingCell?.employeeId === employeeId;
    const editable = canEdit(employeeId, date);
    const holidayInfo = getHolidayInfo(date);
    const isSun = isSunday(date);
    // 檢查是否是禮拜三晚班輪流
    const wednesdayNightShift = wednesdayNightShifts.find(s => s.date === date && s.employeeId === employeeId);
    
    // 檢查是否有固定班表
    const dayOfWeek = new Date(date).getDay();
    const hasFixedShift = fixedShifts.some(f => f.employeeId === employeeId && f.dayOfWeek === dayOfWeek);

    // 檢查是否有核准的請假申請
    const approvedLeaveRequest = leaveRequests.find(
      (req) =>
        req.employeeId === employeeId &&
        req.startDate <= date &&
        req.endDate >= date &&
        req.status === "approved"
    );

    // 檢查是否有核准的加班申請
    const approvedOvertimeRequest = overtimeRequests.find(
      (req) =>
        req.employeeId === employeeId &&
        req.date === date &&
        req.status === "approved"
    );

    if (isEditing) {
      return (
        <div className="p-1">
          <div className="flex flex-col gap-1">
            {shiftOptions.map((s) => (
              <button
                key={s}
                onClick={() => selectShift(date, employeeId, s)}
                className={`text-xs px-1 py-0.5 rounded border ${shiftColors[s].bg} ${shiftColors[s].text} ${shiftColors[s].border} hover:opacity-80`}
              >
                {s}
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
          className={`h-10 flex items-center justify-center rounded font-medium border-2 ${approvedLeaveRequest || approvedOvertimeRequest ? 'bg-orange-600 text-white border-orange-700' : colors.bg + ' ' + colors.text + ' ' + colors.border} ${editable ? 'cursor-pointer hover:opacity-80' : ''} ${isSun ? 'bg-red-50' : ''} ${hasFixedShift ? 'ring-2 ring-orange-400' : ''}`}
        >
          {approvedLeaveRequest ? "假" : approvedOvertimeRequest ? "加" : shift}
          {editable && <span className="ml-1 text-[10px]">✏️</span>}
        </div>
        
        {/* 標記 */}
        {isSun && shift === "X" && (
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
                <span className="text-gray-600">橘色框 - 固定班表</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-gray-600">禮拜日 - 不可編輯</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-gray-600">國定假日 - 可編輯</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-pink-500"></div>
                <span className="text-gray-600">禮拜三晚班輪流</span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
            <button onClick={toggleMonthLock} className={monthLocked ? "app-btn-outline border-red-300 text-red-700" : "app-btn-outline"}>
              {monthLocked ? "解除排休鎖定" : "鎖定本月排休"}
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
          {monthLocked && <span className="ml-3 text-red-600 font-medium">🔒 本月排休已鎖定</span>}
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
                  每個 {dayLabels[fs.dayOfWeek]} - {shiftLabels[fs.shift]}
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
        <h3 className="font-medium text-gray-900 mb-3">🌙 禮拜三晚班輪流 (宜孝/貞葶)</h3>
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
                  <div className="text-[11px] text-gray-500 mt-1">
                    宜孝休：{getWednesdayOffDates("yihsiao", year, month).includes(s.date) ? "是" : "否"} ・
                    貞葶休：{getWednesdayOffDates("zhenting", year, month).includes(s.date) ? "是" : "否"}
                  </div>
                </div>
              );
            })}
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

      <div className="app-card bg-amber-50/80 border-amber-200 p-4">
        <h3 className="font-medium text-amber-800 mb-3">⚠️ 班表提醒</h3>
        <div className="space-y-2 text-sm text-amber-900">
          {Array.from({ length: daysInMonth }, (_, index) => index + 1)
            .map((day) => {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              if (isSunday(dateStr)) return null;
              const workers = displayEmployees.map((emp) => ({
                employee: emp,
                shift: getShiftForDate(dateStr, emp.id),
              }));
              const resting = workers.filter((item) => item.shift === "X").map((item) => item.employee.name);
              const weekdayResting = !isSaturday(dateStr) ? resting : [];
              const aWorkers = workers.filter((item) => item.shift === "A").map((item) => item.employee.name);
              const messages: string[] = [];
              if (weekdayResting.length > 1) {
                messages.push(`平日多人休假：${weekdayResting.join("、")}`);
              }
              if (aWorkers.length === 0 && !isSaturday(dateStr)) {
                messages.push("沒有人上 A 班");
              }
              if (messages.length === 0) return null;
              return (
                <div key={dateStr}>
                  <span className="font-medium">{month}/{day}</span>：{messages.join("；")}
                </div>
              );
            })
            .filter(Boolean)}
        </div>
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
                  
                  let headerClass = "";
                  if (dayOfWeek === 0) headerClass = "text-red-600 bg-red-50";
                  else if (dayOfWeek === 6) headerClass = "text-orange-600 bg-orange-50";
                  else if (holidayInfo.isHoliday) headerClass = "text-yellow-700 bg-yellow-50";
                  
                  return (
                    <th
                      key={day}
                      className={`p-2 text-center text-sm font-medium min-w-[48px] ${headerClass} ${isToday ? "bg-red-100 border-x-4 border-red-500" : ""} cursor-pointer hover:brightness-95 transition`}
                      onClick={() => setSelectedDate(dateStr)}
                      title="查看當日上班狀況"
                    >
                      {isToday && <div className="text-[10px] font-bold text-red-700">今</div>}
                      <div>{day}</div>
                      <div className="text-xs text-gray-500">{dayLabels[dayOfWeek]}</div>
                      {holidayInfo.isHoliday && !isSunday(dateStr) && (
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
                    return (
                      <td key={day} className={`${isSunday(dateStr) ? 'bg-red-50/30' : ''} ${isToday ? "bg-red-50 border-x-4 border-red-500" : ""}`}>
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
            {Object.entries(shiftLabels).map(([shift, label]) => {
              const s = shift as ShiftType;
              const colors = shiftColors[s];
              const isActive = activeLegendShift === s;
              return (
                <button
                  key={shift}
                  type="button"
                  className="relative flex items-center gap-2 text-sm"
                  onMouseEnter={() => setActiveLegendShift(s)}
                  onMouseLeave={() => setActiveLegendShift((prev) => (prev === s ? null : prev))}
                  onClick={() => setActiveLegendShift((prev) => (prev === s ? null : s))}
                >
                  <span className={`w-8 h-8 flex items-center justify-center rounded border-2 font-medium ${colors.bg} ${colors.text} ${colors.border}`}>
                    {s}
                  </span>
                  <span className="text-gray-600">{label}</span>

                  {isActive && (
                    <span className="absolute left-0 bottom-10 z-30 min-w-[170px] rounded-lg border bg-white px-3 py-2 text-left text-xs shadow-xl">
                      <span className="block font-semibold text-gray-800 mb-1">
                        {s}班時段
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
                onClick={() => setSelectedDate(null)}
                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                關閉
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
              {dateModalWorkers.map((worker) => (
                <div key={worker.id} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="font-medium text-gray-800">{worker.name}</span>
                  <span className="text-sm text-gray-600">
                    {worker.shift}班（{shiftLabels[worker.shift]}）
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
