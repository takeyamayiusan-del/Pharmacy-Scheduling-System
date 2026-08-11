/**
 * 變形工時軟性合規提醒（只警告、不阻擋儲存）。
 * - 週期正常工時：兩周 80h／八周 320h
 * - 單日正常工時：兩周最多 10h／八周最多 8h
 * - 例假：每七日至少一日休假（勞基法第36條）
 */

import { getShiftWorkHours } from "@/lib/attendance/canonicalMonthHours";
import {
  workHoursRegimeMeta,
  type WorkHoursRegime,
} from "@/lib/attendance/workHoursRegime";
import { isOffShiftCode } from "@/lib/shift-catalog/resolve";
import type { ScheduleShiftCode, ShiftTimeConfig } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";

export type SoftLimitDefaults = {
  /** 單日表定（正常）工時軟上限（小時） */
  dailyHoursCap: number;
  /** 連續上班天數軟上限（不含休假）；超過即可能違反每七日一例假 */
  consecutiveWorkDaysCap: number;
};

/** 依勞基法變形工時制度給預設軟上限 */
export function defaultSoftLimitsForRegime(
  regime: WorkHoursRegime
): SoftLimitDefaults {
  const meta = workHoursRegimeMeta(regime);
  return {
    dailyHoursCap: meta.dailyNormalHoursCap,
    // 連上 7 天無休 → 該七日無例假
    consecutiveWorkDaysCap: 6,
  };
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(a: string, b: string): number {
  const ms = parseYmd(b).getTime() - parseYmd(a).getTime();
  return Math.round(ms / 86400000);
}

/** 預設週期起算日（星期一）；請改成與核備約定一致 */
export const DEFAULT_WORK_HOURS_CYCLE_ANCHOR = "2026-01-05";

export function normalizeCycleAnchor(
  raw: unknown,
  fallback = DEFAULT_WORK_HOURS_CYCLE_ANCHOR
): string {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return raw.trim();
  }
  return fallback;
}

export function normalizeAgreementNote(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 200);
}

export type CycleBounds = {
  start: string;
  end: string;
  cycleIndex: number;
  cycleWeeks: number;
  cycleHoursCap: number;
};

/** 含 dateStr 的變形工時週期（依起算日對齊） */
export function cycleBoundsForDate(
  dateStr: string,
  regime: WorkHoursRegime,
  anchorYmd: string
): CycleBounds {
  const meta = workHoursRegimeMeta(regime);
  const cycleDays = meta.cycleWeeks * 7;
  const anchor = normalizeCycleAnchor(anchorYmd);
  const diff = daysBetween(anchor, dateStr);
  const cycleIndex = Math.floor(diff / cycleDays);
  const start = formatYmd(addDays(parseYmd(anchor), cycleIndex * cycleDays));
  const end = formatYmd(addDays(parseYmd(start), cycleDays - 1));
  return {
    start,
    end,
    cycleIndex,
    cycleWeeks: meta.cycleWeeks,
    cycleHoursCap: meta.cycleHoursCap,
  };
}

/** 與檢視月份重疊的所有週期 */
export function cyclesOverlappingMonth(
  year: number,
  month: number,
  regime: WorkHoursRegime,
  anchorYmd: string
): CycleBounds[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const seen = new Set<number>();
  const list: CycleBounds[] = [];
  let cursor = parseYmd(monthStart);
  const end = parseYmd(monthEnd);
  while (cursor <= end) {
    const bounds = cycleBoundsForDate(formatYmd(cursor), regime, anchorYmd);
    if (!seen.has(bounds.cycleIndex)) {
      seen.add(bounds.cycleIndex);
      list.push(bounds);
    }
    cursor = addDays(cursor, 1);
  }
  return list;
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = parseYmd(start);
  const last = parseYmd(end);
  while (cursor <= last) {
    out.push(formatYmd(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

export type DeformedHoursWarning = {
  message: string;
  kind: "cycle" | "daily" | "regular_leave";
};

/**
 * 建立變形工時軟性合規提醒（不阻擋）。
 * - 週期：僅檢查完全落在當月內的週期
 * - 單日／例假：以當月為主；例假檢查會往前多看 6 天，避免月初連班漏判
 */
export function buildDeformedHoursSoftWarnings(options: {
  year: number;
  month: number;
  employees: Array<{ id: string; name: string; role?: string }>;
  storeConfig: StoreConfig;
  shiftTimeConfig?: ShiftTimeConfig;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
}): DeformedHoursWarning[] {
  const {
    year,
    month,
    employees,
    storeConfig,
    shiftTimeConfig,
    getShiftForDate,
  } = options;

  const regime = storeConfig.workHoursRegime;
  const meta = workHoursRegimeMeta(regime);
  const soft = defaultSoftLimitsForRegime(regime);
  const anchor = normalizeCycleAnchor(storeConfig.workHoursCycleAnchor);
  const staff = employees.filter((e) => e.role !== "owner");
  const warnings: DeformedHoursWarning[] = [];

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const monthDates = enumerateDates(monthStart, monthEnd);

  // 例假檢查往前多看 6 天（跨月連班）
  const leaveScanStart = formatYmd(addDays(parseYmd(monthStart), -6));
  const leaveScanDates = enumerateDates(leaveScanStart, monthEnd);

  const cyclesInMonth = cyclesOverlappingMonth(year, month, regime, anchor).filter(
    (c) => c.start >= monthStart && c.end <= monthEnd
  );

  for (const cycle of cyclesInMonth) {
    for (const emp of staff) {
      let hours = 0;
      for (const date of enumerateDates(cycle.start, cycle.end)) {
        const shift = getShiftForDate(date, emp.id);
        if (isOffShiftCode(shift, storeConfig)) continue;
        hours += getShiftWorkHours(shift, shiftTimeConfig, storeConfig);
      }
      hours = Math.round(hours * 100) / 100;
      if (hours > cycle.cycleHoursCap) {
        warnings.push({
          kind: "cycle",
          message: `${emp.name}：${meta.label}週期 ${cycle.start}～${cycle.end} 表定正常工時約 ${hours}h，超過 ${cycle.cycleHoursCap}h（${meta.legalRef}，僅提醒）`,
        });
      }
    }
  }

  for (const emp of staff) {
    // 單日正常工時
    for (const date of monthDates) {
      const shift = getShiftForDate(date, emp.id);
      if (isOffShiftCode(shift, storeConfig)) continue;
      const dayHours = getShiftWorkHours(shift, shiftTimeConfig, storeConfig);
      if (dayHours > soft.dailyHoursCap) {
        warnings.push({
          kind: "daily",
          message: `${emp.name}：${date} 表定約 ${dayHours}h，超過${meta.label}單日正常工時上限 ${soft.dailyHoursCap}h（僅提醒）`,
        });
      }
    }

    // 例假：任意連續 7 日至少 1 日休假；只在「違規窗結束日落在本月」時提醒一次
    let streak = 0;
    let streakStart: string | null = null;
    for (const date of leaveScanDates) {
      const shift = getShiftForDate(date, emp.id);
      const off = isOffShiftCode(shift, storeConfig);
      if (!off) {
        if (streak === 0) streakStart = date;
        streak += 1;
        if (
          streak === soft.consecutiveWorkDaysCap + 1 &&
          date >= monthStart &&
          streakStart
        ) {
          warnings.push({
            kind: "regular_leave",
            message: `${emp.name}：${streakStart}～${date} 連續 7 日無休，可能缺少例假（勞基法第36條每七日一例假，僅提醒）`,
          });
        }
      } else {
        streak = 0;
        streakStart = null;
      }
    }
  }

  return warnings;
}
