import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";
import { SHIFT_HOURS } from "@/lib/attendance/calculator";

export type LeaveType =
  | "事假"
  | "病假"
  | "特休"
  | "喪假"
  | "補休假"
  | "其他";

export type LeavePeriod = "full_day" | "morning" | "afternoon" | "custom";

export const LEAVE_TYPE_OPTIONS: LeaveType[] = [
  "事假",
  "病假",
  "特休",
  "喪假",
  "補休假",
  "其他",
];

export const PAYROLL_LEAVE_RATE_KEYS: Record<
  Exclude<LeaveType, "補休假">,
  string
> = {
  事假: "leave_personal",
  病假: "leave_sick",
  喪假: "leave_bereavement",
  特休: "leave_annual",
  其他: "leave_other",
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function parseWorkSegments(shiftTimes: string[]): { start: number; end: number }[] {
  return shiftTimes
    .filter((seg) => seg !== "休假" && seg.includes("-"))
    .map((seg) => {
      const [start, end] = seg.split("-");
      return { start: timeToMinutes(start.trim()), end: timeToMinutes(end.trim()) };
    });
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function overlapMinutes(
  windowStart: number,
  windowEnd: number,
  segStart: number,
  segEnd: number
): number {
  const start = Math.max(windowStart, segStart);
  const end = Math.min(windowEnd, segEnd);
  return Math.max(0, end - start);
}

export type CalculateLeaveHoursParams = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  period: LeavePeriod;
  shiftMode: "schedule" | ShiftType;
  employeeId: string;
  getShiftForDate: (date: string, employeeId: string) => ShiftType;
  shiftTimeConfig: ShiftTimeConfig;
};

/**
 * 只計算「原本應上班」時段與請假時間重疊的部分（休息時間不計）。
 */
export function calculateLeaveWorkHours(params: CalculateLeaveHoursParams): number {
  const {
    startDate,
    endDate,
    startTime,
    endTime,
    period,
    shiftMode,
    employeeId,
    getShiftForDate,
    shiftTimeConfig,
  } = params;

  if (!startDate || !endDate) return 0;

  const dates = enumerateDates(startDate, endDate);
  let totalMinutes = 0;

  for (const date of dates) {
    const shift =
      shiftMode === "schedule" ? getShiftForDate(date, employeeId) : shiftMode;
    if (shift === "X") continue;

    const segments = parseWorkSegments(shiftTimeConfig[shift] ?? []);
    if (segments.length === 0) {
      totalMinutes += SHIFT_HOURS[shift] * 60;
      continue;
    }

    let windowStart = 0;
    let windowEnd = 24 * 60;

    if (period === "morning") {
      windowStart = segments[0].start;
      windowEnd = segments[0].end;
    } else if (period === "afternoon") {
      const last = segments[segments.length - 1];
      windowStart = last.start;
      windowEnd = last.end;
    } else if (period === "full_day") {
      windowStart = segments[0].start;
      windowEnd = segments[segments.length - 1].end;
    } else {
      if (date === startDate) windowStart = timeToMinutes(startTime);
      if (date === endDate) windowEnd = timeToMinutes(endTime);
      if (dates.length === 1 && windowEnd <= windowStart) return 0;
    }

    for (const seg of segments) {
      totalMinutes += overlapMinutes(windowStart, windowEnd, seg.start, seg.end);
    }
  }

  return Math.round((totalMinutes / 60) * 100) / 100;
}

export function periodToTimes(
  period: LeavePeriod,
  shift: ShiftType,
  shiftTimeConfig: ShiftTimeConfig
): { startTime: string; endTime: string } {
  const segments = parseWorkSegments(shiftTimeConfig[shift] ?? []);
  if (period === "morning" && segments[0]) {
    const s = segments[0];
    return {
      startTime: `${String(Math.floor(s.start / 60)).padStart(2, "0")}:${String(s.start % 60).padStart(2, "0")}`,
      endTime: `${String(Math.floor(s.end / 60)).padStart(2, "0")}:${String(s.end % 60).padStart(2, "0")}`,
    };
  }
  if (period === "afternoon" && segments.length > 0) {
    const s = segments[segments.length - 1];
    return {
      startTime: `${String(Math.floor(s.start / 60)).padStart(2, "0")}:${String(s.start % 60).padStart(2, "0")}`,
      endTime: `${String(Math.floor(s.end / 60)).padStart(2, "0")}:${String(s.end % 60).padStart(2, "0")}`,
    };
  }
  if (segments.length > 0) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    return {
      startTime: `${String(Math.floor(first.start / 60)).padStart(2, "0")}:${String(first.start % 60).padStart(2, "0")}`,
      endTime: `${String(Math.floor(last.end / 60)).padStart(2, "0")}:${String(last.end % 60).padStart(2, "0")}`,
    };
  }
  return { startTime: "08:30", endTime: "18:00" };
}

export function dbPeriodFromLeavePeriod(period: LeavePeriod): string {
  if (period === "morning") return "morning";
  if (period === "afternoon") return "afternoon";
  return "full_day";
}

export function inferPeriodFromTimes(
  startTime: string,
  endTime: string
): LeavePeriod {
  if (startTime === "08:30" && endTime === "12:00") return "morning";
  if (startTime === "13:30" && endTime === "18:00") return "afternoon";
  if (startTime === "08:30" && (endTime === "18:00" || endTime === "21:00")) return "full_day";
  return "custom";
}
