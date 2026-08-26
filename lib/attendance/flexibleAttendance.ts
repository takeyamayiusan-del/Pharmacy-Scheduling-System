import { SHIFT_HOURS } from "@/lib/attendance/calculator";
import { getShiftWorkHours } from "@/lib/attendance/canonicalMonthHours";
import { timeToMinutes } from "@/lib/attendance/punchSchedule";
import type { ScheduleShiftCode, ShiftTimeConfig, ShiftType, PunchRecord } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";
import {
  findCatalogShift,
  getScheduleShiftOptions,
  isOffShiftCode,
  resolveShiftTimeRanges,
} from "@/lib/shift-catalog/resolve";

export type FlexiblePeriodMode = "full_day" | "from_time";

/** 事件來源：颱風／天災，或國定假日彈性出勤 */
export type FlexibleEventKind = "typhoon" | "national_holiday";

/**
 * 結算政策：
 * - typhoon_default：原本休假完全跳過（現行颱風）
 * - required_work：應來未到要待補／扣補休；本休有來仍給補休
 * - day_off_no_penalty：有來給補休；沒來不罰
 */
export type FlexibleSettlementPolicy =
  | "typhoon_default"
  | "required_work"
  | "day_off_no_penalty";

export const FLEXIBLE_SETTLEMENT_POLICY_LABELS: Record<FlexibleSettlementPolicy, string> = {
  typhoon_default: "颱風規則（本休跳過）",
  required_work: "規定上班（未到待補；本休有來仍給）",
  day_off_no_penalty: "當天休（有來給時數；沒來不罰）",
};

export type OriginalScheduleEntry = {
  userId: string;
  shift: ScheduleShiftCode;
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
  eventKind: FlexibleEventKind;
  settlementPolicy: FlexibleSettlementPolicy;
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
  scheduledShift: ScheduleShiftCode;
  affectedHours: number;
  actualPunchHours: number;
  outcome: "comp_leave_granted" | "pending_makeup";
  grantHours: number;
  pendingHours: number;
};

function roundHours(hours: number): number {
  return Math.round(Math.max(0, hours) * 100) / 100;
}

function isOff(shift: ScheduleShiftCode, storeConfig?: StoreConfig): boolean {
  return storeConfig ? isOffShiftCode(shift, storeConfig) : shift === "X";
}

function parseShiftRanges(
  config: ShiftTimeConfig,
  shift: ScheduleShiftCode,
  storeConfig?: StoreConfig
): Array<{ start: number; end: number }> {
  const ranges = storeConfig
    ? resolveShiftTimeRanges(shift, storeConfig, config)
    : config[shift] ?? [];
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
  shift: ScheduleShiftCode,
  config: ShiftTimeConfig,
  periodMode: FlexiblePeriodMode,
  fromTime?: string,
  storeConfig?: StoreConfig
): number {
  if (isOff(shift, storeConfig)) return 0;

  const ranges = parseShiftRanges(config, shift, storeConfig);
  if (ranges.length === 0) {
    return getShiftWorkHours(shift, config, storeConfig) || (SHIFT_HOURS[shift] ?? 0);
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
 * 結算預覽。
 * - typhoon_default：只處理原本有排班者；本休完全跳過
 * - required_work：應來未到 → 待補；本休有打卡 → 仍給補休
 * - day_off_no_penalty：有打卡才給；沒來不罰（含原本有班者）
 */
export function buildSettlementPreview(params: {
  employees: Array<{ id: string; name: string; role: string }>;
  originalSchedule: OriginalScheduleEntry[];
  date: string;
  periodMode: FlexiblePeriodMode;
  fromTime?: string;
  shiftTimeConfig: ShiftTimeConfig;
  punchRecords: PunchRecord[];
  storeConfig?: StoreConfig;
  settlementPolicy?: FlexibleSettlementPolicy;
}): SettlementPreviewRow[] {
  const policy = params.settlementPolicy ?? "typhoon_default";
  const nameById = new Map(params.employees.map((e) => [e.id, e.name]));
  const rows: SettlementPreviewRow[] = [];
  const volunteerCap = volunteerGrantCapHours(params.shiftTimeConfig, params.storeConfig);

  for (const entry of params.originalSchedule) {
    const originallyOff = isOff(entry.shift, params.storeConfig);
    const dayPunches = params.punchRecords.filter(
      (p) => p.employeeId === entry.userId && p.date === params.date
    );
    const actualPunchHours = calculateActualPunchHoursInPeriod(
      dayPunches,
      params.periodMode,
      params.fromTime
    );

    if (originallyOff) {
      // 颱風預設：本休完全不動
      if (policy === "typhoon_default") continue;
      // 本休沒來：不算義務、不罰
      if (actualPunchHours <= 0) continue;
      // 本休有來：仍給補休（依實際打卡，上限為預設全日工時）
      rows.push({
        userId: entry.userId,
        employeeName: nameById.get(entry.userId) ?? entry.userId,
        scheduledShift: entry.shift,
        affectedHours: volunteerCap,
        actualPunchHours,
        outcome: "comp_leave_granted",
        grantHours: roundHours(Math.min(actualPunchHours, volunteerCap)),
        pendingHours: 0,
      });
      continue;
    }

    const affectedHours = calculateAffectedShiftHours(
      entry.shift,
      params.shiftTimeConfig,
      params.periodMode,
      params.fromTime,
      params.storeConfig
    );
    if (affectedHours <= 0 && actualPunchHours <= 0) continue;

    if (actualPunchHours > 0) {
      const cap = affectedHours > 0 ? affectedHours : volunteerCap;
      rows.push({
        userId: entry.userId,
        employeeName: nameById.get(entry.userId) ?? entry.userId,
        scheduledShift: entry.shift,
        affectedHours: cap,
        actualPunchHours,
        outcome: "comp_leave_granted",
        grantHours: roundHours(Math.min(actualPunchHours, cap)),
        pendingHours: 0,
      });
      continue;
    }

    // 沒打卡
    if (policy === "day_off_no_penalty") {
      // 當天休：沒來不罰
      continue;
    }

    // typhoon_default / required_work：應來未到 → 待補
    if (affectedHours <= 0) continue;
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

  return rows;
}

/** 本休有來時，補休核發上限（預設平日班工時，否則 8） */
export function volunteerGrantCapHours(
  shiftTimeConfig: ShiftTimeConfig,
  storeConfig?: StoreConfig
): number {
  const fallback =
    storeConfig?.defaultWeekdayShift && storeConfig.defaultWeekdayShift !== "X"
      ? storeConfig.defaultWeekdayShift
      : "B";
  const hours = getShiftWorkHours(fallback, shiftTimeConfig, storeConfig);
  return hours > 0 ? hours : 8;
}

export function buildOriginalScheduleSnapshot(
  employees: Array<{ id: string; role: string }>,
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode,
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
  shift: ScheduleShiftCode,
  cutoffTime: string,
  config: ShiftTimeConfig,
  storeConfig?: StoreConfig
): Array<{ start: number; end: number }> {
  const cutoff = timeToMinutes(cutoffTime);
  const remaining: Array<{ start: number; end: number }> = [];
  for (const range of parseShiftRanges(config, shift, storeConfig)) {
    if (range.end <= cutoff) {
      remaining.push(range);
      continue;
    }
    if (range.start >= cutoff) continue;
    remaining.push({ start: range.start, end: cutoff });
  }
  return remaining;
}

function candidateShiftCodes(
  config: ShiftTimeConfig,
  storeConfig?: StoreConfig
): ScheduleShiftCode[] {
  if (storeConfig?.features.customShiftCatalog) {
    return getScheduleShiftOptions(storeConfig).filter(
      (c) => !isOffShiftCode(c, storeConfig)
    );
  }
  return ["C", "D", "B", "E", "A"];
}

/**
 * 將剩餘時段對應回標準／目錄班別。
 */
export function matchShiftFromRanges(
  remaining: Array<{ start: number; end: number }>,
  config: ShiftTimeConfig,
  storeConfig?: StoreConfig
): ScheduleShiftCode {
  if (remaining.length === 0) return "X";

  const targetKey = rangesKey(remaining);
  const candidates = candidateShiftCodes(config, storeConfig);

  for (const code of candidates) {
    const ranges = parseShiftRanges(config, code, storeConfig);
    if (ranges.length > 0 && rangesKey(ranges) === targetKey) return code;
  }

  let best: { code: ScheduleShiftCode; score: number } | null = null;
  for (const code of candidates) {
    const candidate = parseShiftRanges(config, code, storeConfig);
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

    if (missing > 0) continue;
    const score = covered * 1000 - extra;
    if (!best || score > best.score) best = { code, score };
  }

  return best?.code ?? "X";
}

/** 時段颱風假：未出席受影響時段時，班表改為 cutoff 前的剩餘班別 */
export function resolveShiftAfterTyphoonCutoff(
  originalShift: ScheduleShiftCode,
  cutoffTime: string,
  config: ShiftTimeConfig,
  storeConfig?: StoreConfig
): ScheduleShiftCode {
  if (isOff(originalShift, storeConfig)) return "X";
  const remaining = truncateShiftRangesBefore(
    originalShift,
    cutoffTime,
    config,
    storeConfig
  );
  return matchShiftFromRanges(remaining, config, storeConfig);
}

export type AttendeeShiftChoice = "keep" | "full_day" | "morning" | "afternoon";

function pickByTimeWindow(
  storeConfig: StoreConfig,
  config: ShiftTimeConfig,
  window: Array<{ start: number; end: number }>,
  fallback: ScheduleShiftCode
): ScheduleShiftCode {
  const matched = matchShiftFromRanges(window, config, storeConfig);
  return matched === "X" ? fallback : matched;
}

/** 全日颱風假：有來者依店長選擇的出勤時段對應班別 */
export function resolveFullDayAttendeeShift(
  originalShift: ScheduleShiftCode,
  choice: AttendeeShiftChoice = "keep",
  storeConfig?: StoreConfig,
  config: ShiftTimeConfig = {}
): ScheduleShiftCode {
  const fallback =
    storeConfig?.defaultWeekdayShift && storeConfig.defaultWeekdayShift !== "X"
      ? storeConfig.defaultWeekdayShift
      : "B";

  if (choice === "morning") {
    if (storeConfig?.features.customShiftCatalog) {
      return pickByTimeWindow(
        storeConfig,
        config,
        [{ start: timeToMinutes("08:30"), end: timeToMinutes("12:00") }],
        fallback
      );
    }
    return "C";
  }
  if (choice === "afternoon") {
    if (storeConfig?.features.customShiftCatalog) {
      return pickByTimeWindow(
        storeConfig,
        config,
        [{ start: timeToMinutes("13:30"), end: timeToMinutes("18:00") }],
        fallback
      );
    }
    return "D";
  }
  if (choice === "full_day") {
    if (storeConfig?.features.customShiftCatalog) {
      if (!isOff(originalShift, storeConfig)) {
        const cat = findCatalogShift(storeConfig, originalShift);
        if (cat && (cat.category === "all_day" || cat.category === "day" || cat.category === "split")) {
          return originalShift;
        }
      }
      return fallback;
    }
    if (originalShift === "A" || originalShift === "E") return originalShift;
    return "B";
  }
  return isOff(originalShift, storeConfig) ? fallback : originalShift;
}

/**
 * 依颱風時段、原班別、是否出席（及店長指定班別）決定班表應寫入的班別。
 */
export function resolveTyphoonScheduleShift(params: {
  originalShift: ScheduleShiftCode;
  willAttend: boolean;
  periodMode: FlexiblePeriodMode;
  fromTime?: string;
  shiftTimeConfig: ShiftTimeConfig;
  attendeeChoice?: AttendeeShiftChoice;
  assignedShift?: ScheduleShiftCode;
  storeConfig?: StoreConfig;
}): ScheduleShiftCode {
  const {
    originalShift,
    willAttend,
    periodMode,
    fromTime,
    shiftTimeConfig,
    attendeeChoice,
    assignedShift,
    storeConfig,
  } = params;

  const fallback =
    storeConfig?.defaultWeekdayShift && storeConfig.defaultWeekdayShift !== "X"
      ? storeConfig.defaultWeekdayShift
      : "B";

  if (isOff(originalShift, storeConfig) && !willAttend) return "X";

  if (periodMode === "full_day") {
    if (!willAttend) return "X";
    if (assignedShift) return assignedShift;
    return resolveFullDayAttendeeShift(
      isOff(originalShift, storeConfig) ? fallback : originalShift,
      attendeeChoice,
      storeConfig,
      shiftTimeConfig
    );
  }

  const cutoff = fromTime || "00:00";
  const affected = calculateAffectedShiftHours(
    originalShift,
    shiftTimeConfig,
    "from_time",
    cutoff,
    storeConfig
  );
  if (affected <= 0) return originalShift;
  if (willAttend) return assignedShift ?? originalShift;
  return resolveShiftAfterTyphoonCutoff(
    originalShift,
    cutoff,
    shiftTimeConfig,
    storeConfig
  );
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

/** 竹山確認出勤可指定的班別 */
export const LEGACY_ATTENDEE_SHIFT_OPTIONS: ScheduleShiftCode[] = ["A", "B", "C", "D", "E"];

/** @deprecated 請改用 getAttendeeShiftOptions(storeConfig) */
export const ATTENDEE_SHIFT_OPTIONS: ShiftType[] = ["A", "B", "C", "D", "E"];

/** 依店設定產生出勤班別選項（集集走目錄；竹山 A–E） */
export function getAttendeeShiftOptions(storeConfig: StoreConfig): ScheduleShiftCode[] {
  if (!storeConfig.features.customShiftCatalog) {
    return [...LEGACY_ATTENDEE_SHIFT_OPTIONS];
  }
  return getScheduleShiftOptions(storeConfig).filter(
    (c) => !isOffShiftCode(c, storeConfig)
  );
}

export const FULL_DAY_ATTENDEE_CHOICES: Array<{
  value: AttendeeShiftChoice;
  label: string;
}> = [
  { value: "keep", label: "維持原班" },
  { value: "full_day", label: "全天出勤" },
  { value: "morning", label: "上午半天" },
  { value: "afternoon", label: "下午半天" },
];
