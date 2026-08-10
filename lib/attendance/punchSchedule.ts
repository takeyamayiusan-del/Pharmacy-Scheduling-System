import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";
import { isLegacyShiftCode } from "@/lib/shift-catalog/resolve";

export type PunchAction = "work_in" | "work_out";

export type PunchSlot = {
  action: PunchAction;
  segmentIndex: number;
  scheduledTime: string;
  label: string;
};

const parseRanges = (ranges: string[]): { start: string; end: string }[] =>
  ranges
    .filter((r) => r !== "休假" && r.includes("-"))
    .map((r) => {
      const [start, end] = r.split("-");
      return { start: start.trim(), end: end.trim() };
    });

/** 依時段字串產生打卡槽（可接目錄解析後的 ranges） */
export function getPunchSlotsForRanges(ranges: string[]): PunchSlot[] {
  const slots: PunchSlot[] = [];
  parseRanges(ranges).forEach((range, index) => {
    slots.push({
      action: "work_in",
      segmentIndex: index,
      scheduledTime: range.start,
      label: `上班（第 ${index + 1} 段）`,
    });
    slots.push({
      action: "work_out",
      segmentIndex: index,
      scheduledTime: range.end,
      label: `下班（第 ${index + 1} 段）`,
    });
  });
  return slots;
}

export function getPunchSlotsForShift(
  shift: string,
  config: ShiftTimeConfig
): PunchSlot[] {
  if (!isLegacyShiftCode(shift)) return [];
  return getPunchSlotsForRanges(config[shift] ?? []);
}

export function getBreakCountForShift(shift: string): number {
  if (shift === "A" || shift === "E") return 2;
  if (shift === "B") return 1;
  return 0;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function minutesDiff(actualMinutes: number, scheduledMinutes: number): number {
  return actualMinutes - scheduledMinutes;
}

/** 可提早 10 分鐘打卡 */
export const EARLY_PUNCH_MINUTES = 10;
/** 遲到：第 6 分鐘起算（前 5 分鐘不計） */
export const LATE_GRACE_MINUTES = 5;
/** 遲到 30 分鐘起導向請假 */
export const LATE_LEAVE_REDIRECT_MINUTES = 30;
/** 加班：下班後第 10 分鐘起導向加班申請 */
export const OVERTIME_REDIRECT_MINUTES = 10;

export function calcLateMinutes(actualMinutes: number, scheduledMinutes: number): number {
  const diff = minutesDiff(actualMinutes, scheduledMinutes);
  if (diff <= LATE_GRACE_MINUTES) return 0;
  return diff - LATE_GRACE_MINUTES;
}

export function calcOvertimeMinutes(actualMinutes: number, scheduledEndMinutes: number): number {
  const diff = minutesDiff(actualMinutes, scheduledEndMinutes);
  if (diff < OVERTIME_REDIRECT_MINUTES) return 0;
  return diff;
}

export function formatNowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function todayDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
