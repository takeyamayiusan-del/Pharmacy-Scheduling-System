import { SHIFT_HOURS } from "@/lib/attendance/calculator";
import { timeToMinutes } from "@/lib/attendance/punchSchedule";
import type { ShiftTimeConfig, ShiftType, PunchRecord } from "@/lib/context/AppContext";

export type FlexiblePeriodMode = "full_day" | "from_time";

export type OriginalScheduleEntry = {
  userId: string;
  shift: ShiftType;
};

export type FlexibleAttendanceDay = {
  id: string;
  date: string;
  title: string;
  periodMode: FlexiblePeriodMode;
  fromTime?: string;
  note?: string;
  status: "announced" | "settled" | "cancelled";
  bulletinId?: string;
  originalSchedule: OriginalScheduleEntry[];
  expectedAttendeeIds: string[];
  attendeesConfirmedAt?: string;
  createdBy: string;
  settledAt?: string;
  settledBy?: string;
  createdAt: string;
};

export type PendingMakeupHours = {
  id: string;
  userId: string;
  sourceDayId: string;
  sourceDate: string;
  hours: number;
  status: "pending" | "makeup_assigned" | "comp_leave_deducted" | "manually_cleared";
  makeupDate?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  note?: string;
  createdAt: string;
};

export type SettlementPreviewRow = {
  userId: string;
  employeeName: string;
  scheduledShift: ShiftType;
  affectedHours: number;
  actualPunchHours: number;
  outcome: "comp_leave_granted" | "pending_makeup";
  grantHours: number;
  pendingHours: number;
};

function roundHours(hours: number): number {
  return Math.round(Math.max(0, hours) * 100) / 100;
}

function parseShiftRanges(config: ShiftTimeConfig, shift: ShiftType): Array<{ start: number; end: number }> {
  const ranges = config[shift] ?? [];
  return ranges
    .filter((r) => r !== "休假" && r.includes("-"))
    .map((r) => {
      const [start, end] = r.split("-").map((s) => s.trim());
      return { start: timeToMinutes(start), end: timeToMinutes(end) };
    })
    .filter((r) => r.end > r.start);
}

/** 班別在彈性時段內受影響的時數 */
export function calculateAffectedShiftHours(
  shift: ShiftType,
  config: ShiftTimeConfig,
  periodMode: FlexiblePeriodMode,
  fromTime?: string
): number {
  if (shift === "X") return 0;

  const ranges = parseShiftRanges(config, shift);
  if (ranges.length === 0) {
    return SHIFT_HOURS[shift] ?? 0;
  }

  const windowStart = periodMode === "full_day" ? 0 : timeToMinutes(fromTime || "00:00");
  const windowEnd = 24 * 60;

  let minutes = 0;
  for (const range of ranges) {
    const start = Math.max(range.start, windowStart);
    const end = Math.min(range.end, windowEnd);
    if (end > start) minutes += end - start;
  }
  return roundHours(minutes / 60);
}

/** 實際打卡時數（依 segment 配對），並與彈性時段取交集 */
export function calculateActualPunchHoursInPeriod(
  punches: PunchRecord[],
  periodMode: FlexiblePeriodMode,
  fromTime?: string
): number {
  const windowStart = periodMode === "full_day" ? 0 : timeToMinutes(fromTime || "00:00");
  const windowEnd = 24 * 60;

  const bySegment = new Map<number, { in?: string; out?: string }>();
  for (const p of punches) {
    const cur = bySegment.get(p.segmentIndex) ?? {};
    if (p.action === "work_in") cur.in = p.time;
    if (p.action === "work_out") cur.out = p.time;
    bySegment.set(p.segmentIndex, cur);
  }

  let minutes = 0;
  for (const seg of Array.from(bySegment.values())) {
    if (!seg.in || !seg.out) continue;
    const start = Math.max(timeToMinutes(seg.in), windowStart);
    const end = Math.min(timeToMinutes(seg.out), windowEnd);
    if (end > start) minutes += end - start;
  }
  return roundHours(minutes / 60);
}

/**
 * 結算預覽：只處理「發布當下原本有排班」的人。
 * - 原本休假（X）完全不出現、不做任何動作
 * - 有實際打卡 → 核發補休
 * - 應來卻沒打卡 → 待補時數（擇日補／扣補休）
 */
export function buildSettlementPreview(params: {
  employees: Array<{ id: string; name: string; role: string }>;
  originalSchedule: OriginalScheduleEntry[];
  date: string;
  periodMode: FlexiblePeriodMode;
  fromTime?: string;
  shiftTimeConfig: ShiftTimeConfig;
  punchRecords: PunchRecord[];
}): SettlementPreviewRow[] {
  const nameById = new Map(params.employees.map((e) => [e.id, e.name]));
  const rows: SettlementPreviewRow[] = [];

  for (const entry of params.originalSchedule) {
    if (entry.shift === "X") continue;

    const affectedHours = calculateAffectedShiftHours(
      entry.shift,
      params.shiftTimeConfig,
      params.periodMode,
      params.fromTime
    );
    if (affectedHours <= 0) continue;

    const dayPunches = params.punchRecords.filter(
      (p) => p.employeeId === entry.userId && p.date === params.date
    );
    const actualPunchHours = calculateActualPunchHoursInPeriod(
      dayPunches,
      params.periodMode,
      params.fromTime
    );

    if (actualPunchHours > 0) {
      rows.push({
        userId: entry.userId,
        employeeName: nameById.get(entry.userId) ?? entry.userId,
        scheduledShift: entry.shift,
        affectedHours,
        actualPunchHours,
        outcome: "comp_leave_granted",
        grantHours: roundHours(Math.min(actualPunchHours, affectedHours)),
        pendingHours: 0,
      });
    } else {
      rows.push({
        userId: entry.userId,
        employeeName: nameById.get(entry.userId) ?? entry.userId,
        scheduledShift: entry.shift,
        affectedHours,
        actualPunchHours: 0,
        outcome: "pending_makeup",
        grantHours: 0,
        pendingHours: affectedHours,
      });
    }
  }

  return rows;
}

export function buildOriginalScheduleSnapshot(
  employees: Array<{ id: string; role: string }>,
  getShiftForDate: (date: string, employeeId: string) => ShiftType,
  date: string
): OriginalScheduleEntry[] {
  return employees
    .filter((e) => e.role !== "owner")
    .map((e) => ({
      userId: e.id,
      shift: getShiftForDate(date, e.id),
    }));
}

export const FLEXIBLE_PERIOD_PRESETS: Array<{
  label: string;
  periodMode: FlexiblePeriodMode;
  fromTime?: string;
}> = [
  { label: "全日停班", periodMode: "full_day" },
  { label: "12:00 起停班", periodMode: "from_time", fromTime: "12:00" },
  { label: "14:00 起停班", periodMode: "from_time", fromTime: "14:00" },
  { label: "17:00 起停班", periodMode: "from_time", fromTime: "17:00" },
  { label: "18:00 起停班", periodMode: "from_time", fromTime: "18:00" },
  { label: "19:00 起停班", periodMode: "from_time", fromTime: "19:00" },
];
