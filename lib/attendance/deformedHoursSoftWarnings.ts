/**
 * 變形工時軟性提醒（只警告、不阻擋儲存）。
 * - 週期工時上限：兩周 80h／八周 320h
 * - 日工時上限、連續上班天數
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
  /** 單日表定工時軟上限（小時） */
  dailyHoursCap: number;
  /** 連續上班天數軟上限（不含休假日） */
  consecutiveWorkDaysCap: number;
};

/** 兩周／八周制度下的日工時、連班預設軟上限 */
export function defaultSoftLimitsForRegime(
  regime: WorkHoursRegime
): SoftLimitDefaults {
  // 兩周／八周變形：正常工時單日多以 10 小時為常見上限；連班以 6 日提醒（配合每七日一例假）
  void regime;
  return {
    dailyHoursCap: 10,
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

/** 預設週期起算日（星期一），兩店共用；可在店家設定改 */
export const DEFAULT_WORK_HOURS_CYCLE_ANCHOR = "2026-01-05";

export function normalizeCycleAnchor(raw: unknown, fallback = DEFAULT_WORK_HOURS_CYCLE_ANCHOR): string {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return raw.trim();
  }
  return fallback;
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
  /** 顯示用短訊 */
  message: string;
  kind: "cycle" | "daily" | "consecutive";
};

/**
 * 建立變形工時軟性提醒（不阻擋）。
 * 只檢查與當月重疊的週期，以及當月內的日工時／連班。
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

  const cycles = cyclesOverlappingMonth(year, month, regime, anchor);
  for (const cycle of cycles) {
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
          message: `${emp.name}：${meta.label}週期 ${cycle.start}～${cycle.end} 班表約 ${hours}h，超過上限 ${cycle.cycleHoursCap}h（僅提醒）`,
        });
      }
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDates = enumerateDates(
    `${year}-${String(month).padStart(2, "0")}-01`,
    `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`
  );

  for (const emp of staff) {
    let streak = 0;
    let streakStart: string | null = null;
    for (const date of monthDates) {
      const shift = getShiftForDate(date, emp.id);
      const off = isOffShiftCode(shift, storeConfig);
      if (!off) {
        const dayHours = getShiftWorkHours(shift, shiftTimeConfig, storeConfig);
        if (dayHours > soft.dailyHoursCap) {
          warnings.push({
            kind: "daily",
            message: `${emp.name}：${date} 表定約 ${dayHours}h，超過單日軟上限 ${soft.dailyHoursCap}h（僅提醒）`,
          });
        }
        if (streak === 0) streakStart = date;
        streak += 1;
        if (streak > soft.consecutiveWorkDaysCap) {
          // 只在剛超過時報一次，避免連發
          if (streak === soft.consecutiveWorkDaysCap + 1) {
            warnings.push({
              kind: "consecutive",
              message: `${emp.name}：自 ${streakStart} 起連續上班超過 ${soft.consecutiveWorkDaysCap} 天（${date} 仍上班，僅提醒）`,
            });
          }
        }
      } else {
        streak = 0;
        streakStart = null;
      }
    }
  }

  return warnings;
}
