import { effectiveLeaveRule, type LeavePayKind, type LeaveRulesMap } from "@/lib/attendance/leaveEntitlements";
import type { LeaveType } from "@/lib/attendance/leaveHours";
import {
  calculateRateAmount,
  deriveHourlyRateByLaborStandard,
  type RateConfigForCalc,
  type SalaryBasis,
} from "@/lib/payroll/rateFormulas";

function impliedHourlyRate(salary: SalaryBasis): number {
  if (salary.hourlyRate > 0) return salary.hourlyRate;
  return deriveHourlyRateByLaborStandard(salary.baseSalary, 8);
}

function rateHasCustomAmount(rate: RateConfigForCalc | null | undefined): boolean {
  if (!rate) return false;
  if (rate.formulaType.includes("base_salary_percent") && rate.percentage > 0) return true;
  if (rate.formulaType.includes("hourly_rate")) return true;
  return rate.amount > 0;
}

/**
 * 請假扣款：跟店規給薪語意走。
 * - 有薪（特休／婚喪／產假／陪產／公假／補休）：0
 * - 半薪／無薪：有填費率用費率；沒填則用時薪（半薪 ×0.5）
 * 月薪制實領 = 合約應給 − 此扣款；班表工時已是請假後剩餘，不可再扣一次工時。
 */
export function calculateLeavePayDeduction(params: {
  leaveType: string;
  hours: number;
  overrides?: LeaveRulesMap;
  rate: RateConfigForCalc | null;
  salary: SalaryBasis;
}): { amount: number; payKind: LeavePayKind; usedFallback: boolean } {
  const hours = Math.max(0, params.hours);
  if (hours <= 0 || params.leaveType === "補休假") {
    return { amount: 0, payKind: "paid", usedFallback: false };
  }

  const rule = effectiveLeaveRule(
    params.leaveType as LeaveType,
    params.overrides
  );
  if (rule.payKind === "paid") {
    return { amount: 0, payKind: "paid", usedFallback: false };
  }

  if (rateHasCustomAmount(params.rate)) {
    return {
      amount: calculateRateAmount(hours, params.rate!, params.salary, "hour"),
      payKind: rule.payKind,
      usedFallback: false,
    };
  }

  const hourly = impliedHourlyRate(params.salary);
  const factor = rule.payKind === "half" ? 0.5 : 1;
  const amount = Math.round(hours * hourly * factor * 100) / 100;
  return { amount, payKind: rule.payKind, usedFallback: hourly > 0 };
}
