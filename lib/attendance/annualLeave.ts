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

/**
 * 勞基法第38條特休天數（無店家設定時的預設）。
 * 滿十年起每年加1日，加至30日。
 */
export function statutoryAnnualLeaveDays(months: number): number {
  if (months < 6) return 0;
  if (months < 12) return 3;
  if (months < 24) return 7;
  if (months < 36) return 10;
  if (months < 60) return 14;
  const years = Math.floor(months / 12);
  if (years < 10) return 15;
  return Math.min(30, 15 + (years - 9));
}

export type StatutoryAnnualLeaveTier = {
  seniorityMonths: number;
  days: number;
  description: string;
};

/** 寫入 annual_leave_config 用的法定階梯（含十年以上逐年列） */
export function statutoryAnnualLeaveTiers(): StatutoryAnnualLeaveTier[] {
  const rows: StatutoryAnnualLeaveTier[] = [
    { seniorityMonths: 0, days: 0, description: "入職未滿半年（勞基法第38條）" },
    { seniorityMonths: 6, days: 3, description: "滿6個月" },
    { seniorityMonths: 12, days: 7, description: "滿1年" },
    { seniorityMonths: 24, days: 10, description: "滿2年" },
    { seniorityMonths: 36, days: 14, description: "滿3年" },
    { seniorityMonths: 60, days: 15, description: "滿5年" },
  ];
  for (let years = 10; years <= 24; years++) {
    rows.push({
      seniorityMonths: years * 12,
      days: Math.min(30, 15 + (years - 9)),
      description: `滿${years}年`,
    });
  }
  return rows;
}

/** 依 DB 年度特休設定取得配額天數；無設定時用勞基法第38條 */
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
    return statutoryAnnualLeaveDays(months);
  }

  const tier = yearConfigs.find((c) => months >= c.seniorityMonths);
  return tier?.days ?? 0;
}
