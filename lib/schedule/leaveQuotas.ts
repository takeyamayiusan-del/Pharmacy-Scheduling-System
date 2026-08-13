import type { StorePolicies } from "@/lib/store-policies";

export function saturdayLeaveQuota(
  policies: StorePolicies,
  saturdaysInMonth: number
): number {
  if (policies.saturdayQuotaMode === "all_saturdays") {
    return Math.max(0, saturdaysInMonth);
  }
  return Math.max(0, policies.saturdayLeaveQuota);
}

export function weekdayLeaveQuota(
  policies: StorePolicies,
  isWeekdayOffRule: boolean
): number {
  if (isWeekdayOffRule) return 0;
  return Math.max(0, policies.weekdayLeaveQuota);
}

export function leaveQuotaHint(
  policies: StorePolicies,
  saturdaysInMonth: number,
  isWeekdayOffRule: boolean
): string {
  const sat = saturdayLeaveQuota(policies, saturdaysInMonth);
  const wd = weekdayLeaveQuota(policies, isWeekdayOffRule);
  const sunday = policies.sundayFixedRest ? "週日固定公休" : "週日不固定公休";
  const satText =
    policies.saturdayQuotaMode === "all_saturdays"
      ? `週六可排休 ${sat} 天（本月週六數）`
      : `週六可排休 ${sat} 天`;
  const wdText = isWeekdayOffRule
    ? "平日不排休"
    : `平日可排休 ${wd} 天`;
  const half = policies.halfDayLeaveCountsAsOne
    ? "排休半天也算一次機會。"
    : "";
  return `${sunday}；${satText}；${wdText}。${half}`.trim();
}
