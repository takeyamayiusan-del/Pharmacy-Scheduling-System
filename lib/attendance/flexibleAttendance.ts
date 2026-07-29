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

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function rangesKey(ranges: Array<{ start: number; end: number }>): string {
  return ranges.map((r) => `${minutesToTime(r.start)}-${minutesToTime(r.end)}`).join("|");
}

/** 截斷班別時段：只保留 cutoff 之前的部分 */
export function truncateShiftRangesBefore(
  shift: ShiftType,
  cutoffTime: string,
  config: ShiftTimeConfig
): Array<{ start: number; end: number }> {
  const cutoff = timeToMinutes(cutoffTime);
  const remaining: Array<{ start: number; end: number }> = [];
  for (const range of parseShiftRanges(config, shift)) {
    if (range.end <= cutoff) {
      remaining.push(range);
      continue;
    }
    if (range.start >= cutoff) continue;
    remaining.push({ start: range.start, end: cutoff });
  }
  return remaining;
}

/**
 * 將剩餘時段對應回標準班別。
 * - 精確符合 → 該班別
 * - 無剩餘 → X
 * - 否則找涵蓋剩餘時段、且多餘時段最少的班別（例如全天去掉晚班後接近白班）
 */
export function matchShiftFromRanges(
  remaining: Array<{ start: number; end: number }>,
  config: ShiftTimeConfig
): ShiftType {
  if (remaining.length === 0) return "X";

  const targetKey = rangesKey(remaining);
  const candidates: ShiftType[] = ["C", "D", "B", "E", "A"];

  for (const code of candidates) {
    const ranges = parseShiftRanges(config, code);
    if (ranges.length > 0 && rangesKey(ranges) === targetKey) return code;
  }

  let best: { code: ShiftType; score: number } | null = null;
  for (const code of candidates) {
    const candidate = parseShiftRanges(config, code);
    if (candidate.length === 0) continue;

    let covered = 0;
    let missing = 0;
    for (const need of remaining) {
      let needCovered = 0;
      for (const slot of candidate) {
        const start = Math.max(need.start, slot.start);
        const end = Math.min(need.end, slot.end);
        if (end > start) needCovered += end - start;
      }
      const needMinutes = need.end - need.start;
      covered += needCovered;
      missing += Math.max(0, needMinutes - needCovered);
    }

    let extra = 0;
    for (const slot of candidate) {
      let slotCovered = 0;
      for (const need of remaining) {
        const start = Math.max(need.start, slot.start);
        const end = Math.min(need.end, slot.end);
        if (end > start) slotCovered += end - start;
      }
      extra += Math.max(0, slot.end - slot.start - slotCovered);
    }

    // 必須完整涵蓋剩餘時段；多餘越少越好
    if (missing > 0) continue;
    const score = covered * 1000 - extra;
    if (!best || score > best.score) best = { code, score };
  }

  return best?.code ?? "X";
}

/** 時段颱風假：未出席受影響時段時，班表改為 cutoff 前的剩餘班別 */
export function resolveShiftAfterTyphoonCutoff(
  originalShift: ShiftType,
  cutoffTime: string,
  config: ShiftTimeConfig
): ShiftType {
  if (originalShift === "X") return "X";
  const remaining = truncateShiftRangesBefore(originalShift, cutoffTime, config);
  return matchShiftFromRanges(remaining, config);
}

export type AttendeeShiftChoice = "keep" | "full_day" | "morning" | "afternoon";

/** 全日颱風假：有來者依店長選擇的出勤時段對應班別 */
export function resolveFullDayAttendeeShift(
  originalShift: ShiftType,
  choice: AttendeeShiftChoice = "keep"
): ShiftType {
  if (choice === "morning") return "C";
  if (choice === "afternoon") return "D";
  if (choice === "full_day") {
    if (originalShift === "A" || originalShift === "E") return originalShift;
    return "B";
  }
  return originalShift === "X" ? "B" : originalShift;
}

/**
 * 依颱風時段、原班別、是否出席（及全日出勤選擇）決定班表應寫入的班別。
 * - 時段停班且原班不受影響（如白班 vs 19:00）：維持原班
 * - 時段停班且未出席受影響時段：截斷到停班時刻
 * - 時段停班且有出席：維持原班
 * - 全日停班且未出席：休假 X
 * - 全日停班且有出席：依出勤時段設定班別
 */
export function resolveTyphoonScheduleShift(params: {
  originalShift: ShiftType;
  willAttend: boolean;
  periodMode: FlexiblePeriodMode;
  fromTime?: string;
  shiftTimeConfig: ShiftTimeConfig;
  attendeeChoice?: AttendeeShiftChoice;
}): ShiftType {
  const { originalShift, willAttend, periodMode, fromTime, shiftTimeConfig, attendeeChoice } =
    params;

  if (originalShift === "X" && !willAttend) return "X";

  if (periodMode === "full_day") {
    if (!willAttend) return "X";
    return resolveFullDayAttendeeShift(originalShift === "X" ? "B" : originalShift, attendeeChoice);
  }

  const cutoff = fromTime || "00:00";
  const affected = calculateAffectedShiftHours(
    originalShift,
    shiftTimeConfig,
    "from_time",
    cutoff
  );
  // 白班等：時段完全不受颱風影響 → 班表不動
  if (affected <= 0) return originalShift;
  if (willAttend) return originalShift;
  return resolveShiftAfterTyphoonCutoff(originalShift, cutoff, shiftTimeConfig);
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

export const FULL_DAY_ATTENDEE_CHOICES: Array<{
  value: AttendeeShiftChoice;
  label: string;
}> = [
  { value: "keep", label: "維持原班" },
  { value: "full_day", label: "全天出勤" },
  { value: "morning", label: "上午半天" },
  { value: "afternoon", label: "下午半天" },
];
