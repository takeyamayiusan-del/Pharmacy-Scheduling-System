import type { StorePolicies } from "@/lib/store-policies";
import {
  isLocalSaturday,
  isSundayRestDay,
} from "@/lib/schedule/sundayRest";
import type { LeaveSelectionPeriod } from "@/lib/schedule/leaveSelectionPeriod";

export function isMonthPoolLeaveQuota(policies: StorePolicies): boolean {
  if (policies.saturdayQuotaMode === "month_pool") return true;
  // 舊集集設定：本月所有週六 + 平日 0 天＝有幾個週六就能休幾天，整月可休
  return (
    policies.saturdayQuotaMode === "all_saturdays" &&
    policies.weekdayLeaveQuota <= 0
  );
}

export function saturdayLeaveQuota(
  policies: StorePolicies,
  saturdaysInMonth: number
): number {
  if (
    policies.saturdayQuotaMode === "all_saturdays" ||
    policies.saturdayQuotaMode === "month_pool"
  ) {
    return Math.max(0, saturdaysInMonth);
  }
  return Math.max(0, policies.saturdayLeaveQuota);
}

export function weekdayLeaveQuota(
  policies: StorePolicies,
  isWeekdayOffRule: boolean
): number {
  if (isWeekdayOffRule) return 0;
  if (isMonthPoolLeaveQuota(policies)) return 0;
  return Math.max(0, policies.weekdayLeaveQuota);
}

export function monthLeaveQuota(
  policies: StorePolicies,
  saturdaysInMonth: number
): number {
  return saturdayLeaveQuota(policies, saturdaysInMonth);
}

export function leaveQuotaHint(
  policies: StorePolicies,
  saturdaysInMonth: number,
  isWeekdayOffRule: boolean
): string {
  const sat = saturdayLeaveQuota(policies, saturdaysInMonth);
  const sunday = policies.sundayFixedRest ? "週日固定公休" : "週日不固定公休";
  const half = "排休半天也算一次機會。";
  if (isWeekdayOffRule) {
    const satText =
      policies.saturdayQuotaMode === "fixed"
        ? `週六可排休 ${sat} 天`
        : `週六可排休 ${sat} 天（本月週六數）`;
    return `${sunday}；${satText}；平日不排休。${half}`.trim();
  }
  if (isMonthPoolLeaveQuota(policies)) {
    return `${sunday}；本月可排休 ${sat} 天（等於本月週六數），週一至週六皆可休。${half}`.trim();
  }
  const wd = weekdayLeaveQuota(policies, false);
  const satText =
    policies.saturdayQuotaMode === "all_saturdays"
      ? `週六可排休 ${sat} 天（本月週六數）`
      : `週六可排休 ${sat} 天`;
  return `${sunday}；${satText}；平日可排休 ${wd} 天。${half}`.trim();
}

export function countMonthPoolUsed(
  selectedDates: string[],
  sundayFixedRest = true
): number {
  return selectedDates.filter(
    (d) => d && !isSundayRestDay(d, sundayFixedRest)
  ).length;
}

export function canSelectLeaveDate(input: {
  date: string;
  selectedDates: string[];
  policies: StorePolicies;
  isWeekdayOffRule: boolean;
  saturdaysInMonth: number;
}): boolean {
  const { date, selectedDates, policies, isWeekdayOffRule, saturdaysInMonth } =
    input;
  if (selectedDates.includes(date)) return true;
  if (isSundayRestDay(date, policies.sundayFixedRest)) return false;
  if (isWeekdayOffRule && !isLocalSaturday(date)) return false;

  const satLimit = saturdayLeaveQuota(policies, saturdaysInMonth);
  if (isMonthPoolLeaveQuota(policies) && !isWeekdayOffRule) {
    return countMonthPoolUsed(selectedDates, policies.sundayFixedRest) < satLimit;
  }

  if (isLocalSaturday(date)) {
    const satUsed = selectedDates.filter((d) => isLocalSaturday(d)).length;
    return satUsed < satLimit;
  }

  const wdLimit = weekdayLeaveQuota(policies, isWeekdayOffRule);
  const wdUsed = selectedDates.filter(
    (d) => !isLocalSaturday(d) && !isSundayRestDay(d, policies.sundayFixedRest)
  ).length;
  return wdUsed < wdLimit;
}

export function leaveAddBlockedMessage(input: {
  date: string;
  selectedDates: string[];
  policies: StorePolicies;
  isWeekdayOffRule: boolean;
  saturdaysInMonth: number;
  isHalfDayLeaveRule?: boolean;
  period?: LeaveSelectionPeriod;
  workShift?: string | null;
}): string | null {
  const {
    date,
    selectedDates,
    policies,
    isWeekdayOffRule,
    saturdaysInMonth,
    isHalfDayLeaveRule,
    period,
    workShift,
  } = input;

  if (isSundayRestDay(date, policies.sundayFixedRest)) {
    return "禮拜日固定公休，不需要另外選擇";
  }
  if (isWeekdayOffRule && !isLocalSaturday(date)) {
    return "此員工套用平日不排休規則，排休只能選擇週六";
  }
  if (isHalfDayLeaveRule) {
    if (period !== "morning" && period !== "afternoon") {
      return "此員工套用「只能休半天」，請選擇休上午或休下午";
    }
    if (!workShift || workShift === "X") {
      return "請選擇剩下半天要上的班別";
    }
  }

  const satLimit = saturdayLeaveQuota(policies, saturdaysInMonth);
  if (isMonthPoolLeaveQuota(policies) && !isWeekdayOffRule) {
    if (countMonthPoolUsed(selectedDates, policies.sundayFixedRest) >= satLimit) {
      return `本月排休已達 ${satLimit} 天上限（依本月週六數）`;
    }
    return null;
  }

  if (isLocalSaturday(date)) {
    const satUsed = selectedDates.filter((d) => isLocalSaturday(d)).length;
    if (satUsed >= satLimit) {
      return `禮拜六排休已達 ${satLimit} 天上限`;
    }
    return null;
  }

  const wdLimit = weekdayLeaveQuota(policies, isWeekdayOffRule);
  const wdUsed = selectedDates.filter(
    (d) => !isLocalSaturday(d) && !isSundayRestDay(d, policies.sundayFixedRest)
  ).length;
  if (wdUsed >= wdLimit) {
    return wdLimit <= 0
      ? "本店平日不可排休"
      : `平日排休已達 ${wdLimit} 天上限`;
  }
  return null;
}
