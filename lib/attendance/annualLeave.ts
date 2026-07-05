import type { AnnualLeaveConfig, Employee } from "@/lib/context/AppContext";

/** 計算截至某日為止的年資月數 */
export function getMonthsOfService(hireDateStr: string, asOf: Date): number {
  const hire = new Date(hireDateStr);
  let months =
    (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth());
  if (asOf.getDate() < hire.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * 決定計算年資的基準日。
 * - 當年度：用今天（即時反映是否滿半年/一年）
 * - 過去或未來年度：用該年 12/31（年度總表或歷史查詢）
 */
export function getAsOfDateForYear(year: number, referenceDate: Date = new Date()): Date {
  if (year === referenceDate.getFullYear()) {
    return referenceDate;
  }
  return new Date(year, 11, 31);
}

/** 依 DB 年度特休設定取得配額天數 */
export function resolveAnnualLeaveQuotaDays(
  employee: Employee,
  year: number,
  configs: AnnualLeaveConfig[],
  referenceDate: Date = new Date()
): number {
  const asOf = getAsOfDateForYear(year, referenceDate);
  const months = getMonthsOfService(employee.hireDate, asOf);

  const yearConfigs = configs
    .filter((c) => c.year === year)
    .sort((a, b) => b.seniorityMonths - a.seniorityMonths);

  if (yearConfigs.length === 0) {
    if (months < 6) return 0;
    if (months < 12) return 3;
    return 7;
  }

  const tier = yearConfigs.find((c) => months >= c.seniorityMonths);
  return tier?.days ?? 0;
}
