import type { AnnualLeaveConfig, Employee } from "@/lib/context/AppContext";

/** 計算截至某日為止的年資月數 */
export function getMonthsOfService(hireDateStr: string, asOf: Date): number {
  const hire = new Date(hireDateStr);
  let months =
    (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth());
  if (asOf.getDate() < hire.getDate()) months -= 1;
  return Math.max(0, months);
}

/** 依 DB 年度特休設定取得配額天數 */
export function resolveAnnualLeaveQuotaDays(
  employee: Employee,
  year: number,
  configs: AnnualLeaveConfig[]
): number {
  const yearConfigs = configs
    .filter((c) => c.year === year)
    .sort((a, b) => b.seniorityMonths - a.seniorityMonths);

  if (yearConfigs.length === 0) {
    const months = getMonthsOfService(employee.hireDate, new Date(year, 11, 31));
    if (months < 6) return 0;
    if (months < 12) return 3;
    return 7;
  }

  const asOf = new Date(year, 11, 31);
  const months = getMonthsOfService(employee.hireDate, asOf);
  const tier = yearConfigs.find((c) => months >= c.seniorityMonths);
  return tier?.days ?? 0;
}
