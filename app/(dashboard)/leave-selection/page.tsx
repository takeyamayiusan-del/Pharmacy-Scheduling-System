"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context/AppContext";
import { leaveQuotaHint } from "@/lib/schedule/leaveQuotas";
import {
  buildScheduleWarnings,
  isEveningOrFullCoverageShift,
} from "@/lib/schedule/scheduleWarnings";
import { formatShiftName } from "@/lib/schedule/shiftLabels";
import { isPastMonth } from "@/lib/schedule/monthAccess";
import { LeaveOrderGuide } from "@/components/schedule/LeaveOrderGuide";
import { HelpTip } from "@/components/ui/HelpTip";
import { getLocalDayOfWeek } from "@/lib/schedule/sundayRest";

type PendingEveningLeave = {
  dateStr: string;
  day: number;
  shiftLabel: string;
};

export default function LeaveSelectionPage() {
  const router = useRouter();
  const {
    currentUser,
    employees,
    isSunday,
    isSaturday,
    countSaturdaysInMonth,
    getHolidayInfo,
    getLeaveSummary,
    toggleLeaveDate,
    getShiftForDate,
    isLeaveMonthLocked,
    shiftDisplayConfig,
    shiftTimeConfig,
    storeConfig,
    addBulletinItem,
    activeSiteId,
  } = useApp();
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [pendingEveningLeave, setPendingEveningLeave] = useState<PendingEveningLeave | null>(null);
  const [isSubmittingLeaveAction, setIsSubmittingLeaveAction] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOffset = new Date(year, month - 1, 1).getDay();
  const saturdayCount = countSaturdaysInMonth(year, month);
  const leaveSummary = currentUser ? getLeaveSummary(currentUser.id, year, month) : null;
  const selectedDates = leaveSummary?.selectedDates ?? [];
  const monthLocked = isLeaveMonthLocked(year, month);
  const viewingPastMonth = isPastMonth(year, month);
  const weekdayOffOnly = currentUser?.isWeekdayOffRule ?? false;
  const storageScope = `${currentUser?.id ?? "guest"}:${activeSiteId}`;

  const remaining = {
    weekend: Math.max(0, (leaveSummary?.saturdayLimit ?? 0) - (leaveSummary?.saturdayUsed ?? 0)),
    weekday: Math.max(0, (leaveSummary?.weekdayLimit ?? 0) - (leaveSummary?.weekdayUsed ?? 0)),
  };

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  const applyLeaveSelection = (dateStr: string) => {
    if (!currentUser) return { success: false as const, message: "請先登入" };
    const result = toggleLeaveDate(currentUser.id, dateStr);
    if (!result.success && result.message) {
      alert(result.message);
    }
    return result;
  };

  const completeEveningLeave = async (
    action: "only" | "bulletin" | "swap"
  ) => {
    if (!pendingEveningLeave || !currentUser || isSubmittingLeaveAction) return;
    setIsSubmittingLeaveAction(true);
    try {
      const { dateStr, day, shiftLabel } = pendingEveningLeave;
      const result = applyLeaveSelection(dateStr);
      if (!result.success) {
        setPendingEveningLeave(null);
        return;
      }

      if (action === "bulletin") {
        await addBulletinItem({
          authorId: currentUser.id,
          title: `${month}/${day} 需代晚班`,
          content: `[COVER_DATE:${dateStr}]\n${currentUser.name} 預計於 ${year}/${month}/${day} 排休，當日原為 ${shiftLabel}（含晚班），誠徵代晚班，歡迎洽詢換班。`,
          type: "cover_request",
          status: "active",
          isUrgent: false,
          isPinned: false,
          targetType: "all",
          targetIds: [],
        });
        alert("已發布代班公告，同事可在班表頁公告欄查看。");
      }

      if (action === "swap") {
        const params = new URLSearchParams({
          date: dateStr,
          source: "leave_evening_conflict",
          source_note: `${year}/${month}/${day} 排休需代 ${shiftLabel} 晚班`,
        });
        router.push(`/applications/shift-swap?${params.toString()}`);
      }

      setPendingEveningLeave(null);
    } catch (error) {
      console.error("[completeEveningLeave]", error);
      alert("操作失敗，請稍後再試");
    } finally {
      setIsSubmittingLeaveAction(false);
    }
  };

  const toggleDate = (day: number) => {
    if (!currentUser) return;
    if (monthLocked) {
      alert("本月份班表已鎖定，無法變更排休選擇（請假／換班／加班仍可申請）");
      return;
    }
    if (viewingPastMonth) {
      alert("已過去的月份無法變更排休選擇");
      return;
    }
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isSelected = selectedDates.includes(dateStr);

    if (isSelected) {
      applyLeaveSelection(dateStr);
      return;
    }

    const shiftOnDate = getShiftForDate(dateStr, currentUser.id);
    if (isEveningOrFullCoverageShift(shiftOnDate, storeConfig, shiftTimeConfig)) {
      setPendingEveningLeave({
        dateStr,
        day,
        shiftLabel: formatShiftName(shiftDisplayConfig, shiftOnDate, storeConfig),
      });
      return;
    }

    applyLeaveSelection(dateStr);
  };

  const canSelectDate = (day: number) => {
    if (!currentUser) return false;
    if (viewingPastMonth) return false;
    if (monthLocked) return false;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (selectedDates.includes(dateStr)) return true;
    if (isSunday(dateStr)) return false;
    if (isSaturday(dateStr)) {
      return (leaveSummary?.saturdayUsed ?? 0) < (leaveSummary?.saturdayLimit ?? 0);
    }
    if (weekdayOffOnly) return false;
    return (leaveSummary?.weekdayUsed ?? 0) < (leaveSummary?.weekdayLimit ?? 0);
  };

  const warnings = buildScheduleWarnings({
    year,
    month,
    daysInMonth,
    employees,
    shiftDisplayConfig,
    getShiftForDate,
    storeConfig,
    shiftTimeConfig,
  });

  return (
    <div className="space-y-6">
      {monthLocked && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-medium text-red-700">
            本月份班表已由店長鎖定，無法變更排休選擇。請假、換班、加班仍可申請；店長可於班表頁調整。
          </p>
        </div>
      )}

      {viewingPastMonth && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-700">
            已過去的月份僅供查閱，無法變更排休選擇或提出該月申請。
          </p>
        </div>
      )}

      <div className="app-toolbar">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={prevMonth} className="app-btn-outline shrink-0" aria-label="上個月">
            ◀
          </button>
          <h2 className="text-xl sm:text-2xl app-title truncate">
            {year}年{month}月 排休選擇
          </h2>
          <button onClick={nextMonth} className="app-btn-outline shrink-0" aria-label="下個月">
            ▶
          </button>
        </div>
      </div>

      <LeaveOrderGuide defaultOpen />

      <HelpTip
        title="排休規則說明"
        hint="點選日期即時儲存，無需確認"
        defaultOpen
        storageKey={`help:leave-selection-rules:${storageScope}`}
      >
        <p>• {leaveQuotaHint(storeConfig.policies, saturdayCount, weekdayOffOnly)}</p>
        <p>
          • 平常預設班別為{" "}
          {formatShiftName(
            shiftDisplayConfig,
            storeConfig.defaultWeekdayShift || "B",
            storeConfig
          )}
          ；含晚班／全天覆蓋的班別排休時會提醒代班
        </p>
        <p>
          • <strong>點選日期即會儲存或取消</strong>，沒有確認鍵，也無需另外提交；選取後會同步到月曆式班表當日為休假
        </p>
        <p>• 月曆表頭為「日～六」，與「我的班表」相同，格子也標示星期，避免對錯日期</p>
        <p>• 已核准的請假以月曆式班表為準，「我的班表」會顯示相同結果（全日假／半日假）</p>
        <p>• 若選到您原為含晚班（或全天覆蓋）的日期，系統會提示：優先換班（指定人）或不公告；有需要才可公開徵求代班</p>
        {saturdayCount >= 5 && storeConfig.policies.saturdayQuotaMode === "fixed" && (
          <p className="text-violet-700 font-medium">
            • 本月有 {saturdayCount} 個禮拜六，週六排休上限仍為 {leaveSummary?.saturdayLimit ?? 2} 天
          </p>
        )}
        {weekdayOffOnly && (
          <p className="text-violet-700 font-medium">
            • 您套用「平日不排休」規則，排休只能選擇禮拜六（請至固定班表由店長設定）
          </p>
        )}
      </HelpTip>

      <div className="app-panel p-4">
        <h3 className="app-section-title mb-3">剩餘可選天數</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full font-medium">
              禮拜六：{remaining.weekend}天
            </span>
          </div>
          {!weekdayOffOnly && (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-sky-100 text-sky-800 rounded-full font-medium">
                平日：{remaining.weekday}天
              </span>
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-3">
          目前已選 {selectedDates.length} 天
          {monthLocked ? "（本月已鎖定）" : ""}
        </p>
      </div>

      <div
        className={`rounded-xl p-4 border ${
          warnings.length > 0
            ? "bg-amber-50 border-amber-200"
            : "bg-green-50 border-green-200"
        }`}
      >
        <h3
          className={`font-medium mb-2 ${
            warnings.length > 0 ? "text-amber-800" : "text-green-800"
          }`}
        >
          {warnings.length > 0 ? "⚠️ 排班提醒" : "✅ 排班提醒"}
        </h3>
        {warnings.length > 0 ? (
          <div className="space-y-2 text-sm text-amber-900">
            {warnings.map((warning) => (
              <div key={warning.dateStr}>
                <span className="font-medium">{warning.day} 日：</span>
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

      {/* 桌面端適中寬度：比 max-w-2xl 寬一些，仍避免全寬過大 */}
      <div className="app-panel overflow-hidden max-w-4xl">
        <div className="p-3 sm:p-5">
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
              <div
                key={i}
                className={`text-center font-medium py-1.5 text-xs sm:text-sm ${i === 0 ? "text-red-600" : i === 6 ? "text-orange-600" : "text-gray-700"}`}
              >
                {d}
              </div>
            ))}

            {Array.from({ length: firstDayOffset }, (_, i) => (
              <div key={`empty-${i}`} className="min-h-[4.25rem] sm:min-h-[4.75rem] rounded-lg bg-transparent" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSun = isSunday(dateStr);
              const isSat = isSaturday(dateStr);
              const canSelect = canSelectDate(day);
              const isSelected = selectedDates.includes(dateStr);
              const holidayInfo = getHolidayInfo(dateStr);
              const weekday = ["日", "一", "二", "三", "四", "五", "六"][getLocalDayOfWeek(dateStr)] ?? "";

              return (
                <div
                  key={day}
                  onClick={() => canSelect && toggleDate(day)}
                  className={`
                    min-h-[4.25rem] sm:min-h-[4.75rem] py-1 flex flex-col items-center justify-center rounded-lg relative text-sm
                    ${isSelected ? "bg-green-500 text-white cursor-pointer" : "bg-gray-50 hover:bg-gray-100"}
                    ${isSun ? "bg-red-50 text-red-600" : ""}
                    ${isSat && !isSelected ? "bg-orange-50" : ""}
                    ${!canSelect && !isSelected && !isSun ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <span className="font-medium leading-none">{day}</span>
                  <span className={`text-[10px] leading-tight mt-0.5 ${isSelected ? "text-white/90" : isSun ? "text-red-500" : isSat ? "text-orange-600" : "text-slate-400"}`}>
                    {weekday}
                  </span>
                  {isSelected && <span className="text-[10px] sm:text-xs leading-tight">已選</span>}
                  {isSun && !isSelected && <span className="text-[10px] sm:text-xs leading-tight">固定</span>}
                  {holidayInfo.isHoliday && !isSun && (
                    <div className="absolute inset-x-0 bottom-0 rounded-b-lg bg-yellow-400 text-yellow-950 text-[10px] sm:text-xs font-bold leading-none py-0.5 text-center border-t border-amber-600">
                      國定
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-3 sm:p-4 border-t bg-gray-50 flex flex-wrap gap-3 sm:gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="w-6 h-6 bg-green-500 rounded flex items-center justify-center text-white text-xs">選</span>
            已選擇
          </span>
          <span className="flex items-center gap-2">
            <span className="w-6 h-6 bg-red-50 rounded flex items-center justify-center text-red-600 text-xs">固</span>
            固定禮拜日
          </span>
          <span className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-yellow-400 text-yellow-950 text-xs font-bold rounded border border-amber-600">國定</span>
            國定假日
          </span>
        </div>
      </div>

      {pendingEveningLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="app-panel shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">需代晚班提醒</h3>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium text-amber-800">
                {month}/{pendingEveningLeave.day} 日
              </span>
              依目前班表，您當天原為{" "}
              <span className="font-medium">{pendingEveningLeave.shiftLabel}</span>
              （含晚班）。若排休，建議找人代晚班。
            </p>
            <p className="text-sm text-gray-500 mb-5">
              若已有指定換班對象，請用換班申請即可，不必發公告；只有需要公開徵求代班時才發布公告。
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={isSubmittingLeaveAction}
                onClick={() => completeEveningLeave("swap")}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                排休並提出換班申請（指定對象）
              </button>
              <button
                type="button"
                disabled={isSubmittingLeaveAction}
                onClick={() => completeEveningLeave("only")}
                className="w-full px-4 py-2.5 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                仍要排休（不公告）
              </button>
              <button
                type="button"
                disabled={isSubmittingLeaveAction}
                onClick={() => completeEveningLeave("bulletin")}
                className="w-full px-4 py-2.5 border-2 border-amber-200 text-amber-800 rounded-lg hover:bg-amber-50 disabled:opacity-50"
              >
                有需要再公告（公開徵求代班）
              </button>
              <button
                type="button"
                disabled={isSubmittingLeaveAction}
                onClick={() => setPendingEveningLeave(null)}
                className="w-full px-4 py-2 text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
