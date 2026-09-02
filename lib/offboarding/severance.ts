import { getMonthsOfService } from "@/lib/attendance/annualLeave";

/** 勞基法第 16 條預告期間（日） */
export function statutoryNoticeDays(monthsOfService: number): number {
  if (monthsOfService < 3) return 0;
  if (monthsOfService < 12) return 10;
  if (monthsOfService < 36) return 20;
  return 30;
}

export function monthsOfServiceAsOf(hireDate: string, asOfDate: string): number {
  const asOf = new Date(`${asOfDate}T12:00:00`);
  return getMonthsOfService(hireDate, asOf);
}

/**
 * 勞退新制資遣費（勞退條例第 18 條簡化）
 * 每滿一年一個基數，未滿一年按比例。
 */
export function calcSeveranceNewSystem(
  averageMonthlyWage: number,
  monthsOfService: number
): number {
  if (averageMonthlyWage <= 0 || monthsOfService <= 0) return 0;
  const bases = monthsOfService / 12;
  return Math.round(averageMonthlyWage * bases);
}

/**
 * 勞基法舊制資遣費（第 17 條簡化）
 * 前 15 年每年 2 個月平均工資，第 16 年起每年 1 個月；未滿年按比例。
 */
export function calcSeveranceOldSystem(
  averageMonthlyWage: number,
  monthsOfService: number
): number {
  if (averageMonthlyWage <= 0 || monthsOfService <= 0) return 0;
  const totalYears = monthsOfService / 12;
  const fullYears = Math.floor(totalYears);
  const fraction = totalYears - fullYears;

  let monthBases = 0;
  for (let y = 1; y <= fullYears; y += 1) {
    monthBases += y <= 15 ? 2 : 1;
  }
  if (fraction > 0) {
    const nextYear = fullYears + 1;
    monthBases += (nextYear <= 15 ? 2 : 1) * fraction;
  }
  return Math.round(averageMonthlyWage * monthBases);
}

export function calcSeverancePay(params: {
  pensionSystem: "new" | "old";
  averageMonthlyWage: number;
  monthsOfService: number;
  offboardingType: "layoff" | "resignation" | "retirement";
}): number {
  if (params.offboardingType !== "layoff") return 0;
  if (params.pensionSystem === "old") {
    return calcSeveranceOldSystem(params.averageMonthlyWage, params.monthsOfService);
  }
  return calcSeveranceNewSystem(params.averageMonthlyWage, params.monthsOfService);
}

/** 特休未休折算：以月薪 ÷ 30 為日薪（常見實務，店規可再調） */
export function calcAnnualLeavePayout(
  balanceDays: number,
  monthlyWage: number,
  daysPerMonth = 30
): number {
  if (balanceDays <= 0 || monthlyWage <= 0) return 0;
  const dailyWage = monthlyWage / daysPerMonth;
  return Math.round(balanceDays * dailyWage);
}

/** 補休未休折算 */
export function calcCompLeavePayout(balanceHours: number, hourlyRate: number): number {
  if (balanceHours <= 0 || hourlyRate <= 0) return 0;
  return Math.round(balanceHours * hourlyRate);
}
