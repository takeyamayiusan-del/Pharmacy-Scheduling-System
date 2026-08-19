import { getShiftWorkHours } from "@/lib/attendance/canonicalMonthHours";
import {
  cyclesOverlappingMonth,
} from "@/lib/attendance/deformedHoursSoftWarnings";
import {
  resolveEmployeeCycleAnchor,
  resolveEmployeeWorkHoursRegime,
  type RegimeEmployee,
} from "@/lib/attendance/employeeRegime";
import { workHoursRegimeMeta, type WorkHoursRegime } from "@/lib/attendance/workHoursRegime";
import type { ScheduleShiftCode, ShiftTimeConfig } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";
import { isOffShiftCode } from "@/lib/shift-catalog/resolve";
import { isFixedSundayRest } from "@/lib/schedule/sundayRest";

export type AutoRestEmployee = RegimeEmployee & {
  id: string;
  name: string;
  role?: string | null;
  baselineShift?: string | null;
};

export type AutoRestDateSuggestion = {
  date: string;
  currentShift: string;
  hoursRemoved: number;
};

export type AutoRestEmployeeSuggestion = {
  employeeId: string;
  employeeName: string;
  regime: WorkHoursRegime;
  cycleStart: string;
  cycleEnd: string;
  cycleHours: number;
  cycleCap: number;
  excessHours: number;
  baselineShift: string;
  baselineHours: number;
  suggestedDates: AutoRestDateSuggestion[];
};

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function monthBounds(year: number, month: number) {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(last).padStart(2, "0")}`,
  };
}

/**
 * 依個人變形工時試算：週期表定工時超過上限時，建議在本月插入休假。
 * 不寫入班表；由店長確認後才套用。
 */
export function previewAutoRest(options: {
  year: number;
  month: number;
  employees: AutoRestEmployee[];
  storeConfig: StoreConfig;
  shiftTimeConfig?: ShiftTimeConfig;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
}): AutoRestEmployeeSuggestion[] {
  const {
    year,
    month,
    employees,
    storeConfig,
    shiftTimeConfig,
    getShiftForDate,
  } = options;
  const { start: monthStart, end: monthEnd } = monthBounds(year, month);
  const suggestions: AutoRestEmployeeSuggestion[] = [];

  for (const emp of employees) {
    if (emp.role === "owner") continue;
    const regime = resolveEmployeeWorkHoursRegime(emp, storeConfig);
    const meta = workHoursRegimeMeta(regime);
    const anchor = resolveEmployeeCycleAnchor(emp, storeConfig, storeConfig.policies);
    // 含跨月週期：八周很少整段落在單月內，仍依入職日起算的週期合計
    const cycles = cyclesOverlappingMonth(year, month, regime, anchor);
    if (cycles.length === 0) continue;

    const baselineShift =
      emp.baselineShift?.trim() ||
      storeConfig.defaultWeekdayShift ||
      "B";
    const baselineHours = Math.max(
      0.5,
      getShiftWorkHours(baselineShift, shiftTimeConfig, storeConfig) || meta.dailyNormalHoursCap
    );

    for (const cycle of cycles) {
      let hours = 0;
      const workDatesInMonth: Array<{ date: string; shift: string; hours: number }> = [];
      for (const date of enumerateDates(cycle.start, cycle.end)) {
        const shift = getShiftForDate(date, emp.id);
        if (isOffShiftCode(shift, storeConfig)) continue;
        const h = getShiftWorkHours(shift, shiftTimeConfig, storeConfig);
        hours += h;
        if (
          date >= monthStart &&
          date <= monthEnd &&
          !isFixedSundayRest(date, storeConfig.policies.sundayFixedRest)
        ) {
          workDatesInMonth.push({ date, shift, hours: h });
        }
      }
      hours = Math.round(hours * 100) / 100;
      const excess = Math.round((hours - cycle.cycleHoursCap) * 100) / 100;
      if (excess <= 0) continue;

      const neededDays = autoRestNeededDays(excess, baselineHours);
      const pick = [...workDatesInMonth]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, neededDays);

      suggestions.push({
        employeeId: emp.id,
        employeeName: emp.name,
        regime,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        cycleHours: hours,
        cycleCap: cycle.cycleHoursCap,
        excessHours: excess,
        baselineShift,
        baselineHours,
        suggestedDates: pick.map((d) => ({
          date: d.date,
          currentShift: d.shift,
          hoursRemoved: d.hours,
        })),
      });
    }
  }

  return suggestions;
}

export function countAutoRestDays(suggestions: AutoRestEmployeeSuggestion[]): number {
  return suggestions.reduce((sum, s) => sum + s.suggestedDates.length, 0);
}

export function autoRestPreviewLabel(suggestions: AutoRestEmployeeSuggestion[]): string {
  const days = countAutoRestDays(suggestions);
  const people = new Set(suggestions.map((s) => s.employeeId)).size;
  if (days <= 0) return "本月無需播假";
  return `將自動排 ${days} 日（${people} 人）`;
}

/** 播假是把上班日改成休假來扣回超時，不是發補休時數。 */
export function autoRestNeededDays(excessHours: number, baselineHours: number): number {
  const hours = Math.max(0.5, baselineHours);
  return Math.ceil(Math.max(0, excessHours) / hours);
}

export function autoRestCellNote(options: {
  regimeLabel: string;
  excessHours: number;
  baselineShiftName: string;
  baselineHours: number;
}): string {
  return `變形工時超時播假（${options.regimeLabel}，超 ${options.excessHours} 小時，基準班 ${options.baselineShiftName} ${options.baselineHours}h）`;
}
