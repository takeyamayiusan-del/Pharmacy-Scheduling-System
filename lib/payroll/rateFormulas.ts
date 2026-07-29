export type PayrollFormulaType =
  | "fixed_amount"
  | "base_salary_percent"
  | "hourly_rate";

export type RateConfigForCalc = {
  itemKey: string;
  amount: number;
  formulaType: PayrollFormulaType;
  /** 底薪百分比，例如 0.4167 表示底薪的 0.4167%／單位 */
  percentage: number;
};

export type SalaryBasis = {
  baseSalary: number;
  hourlyRate: number;
};

export const FORMULA_TYPE_OPTIONS: Array<{
  value: PayrollFormulaType;
  label: string;
  hint: string;
}> = [
  {
    value: "fixed_amount",
    label: "固定金額 × 單位",
    hint: "例如：請假時數 × 150 元",
  },
  {
    value: "base_salary_percent",
    label: "底薪 × 百分比 × 單位",
    hint: "例如：請假時數 ×（底薪 × 0.4167%）≈ 月薪／240",
  },
  {
    value: "hourly_rate",
    label: "員工時薪 × 倍數 × 單位",
    hint: "例如：加班時數 × 時薪 × 1.34（倍數填在金額）",
  },
];

export function roundMoney(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

/**
 * 依費率公式計算「每一單位」金額（每小時／每分鐘）。
 * - fixed_amount：直接用 amount
 * - base_salary_percent：底薪 × (percentage/100)
 * - hourly_rate：員工時薪 × amount（amount 當倍數，預設視為 1）
 */
export function resolveUnitAmount(
  rate: Pick<RateConfigForCalc, "amount" | "formulaType" | "percentage">,
  salary: SalaryBasis
): number {
  if (rate.formulaType === "base_salary_percent") {
    return roundMoney(salary.baseSalary * (rate.percentage / 100));
  }
  if (rate.formulaType === "hourly_rate") {
    const multiplier = rate.amount > 0 ? rate.amount : 1;
    return roundMoney(salary.hourlyRate * multiplier);
  }
  return roundMoney(rate.amount);
}

/** 單位數量 × 單位金額 */
export function calculateRateAmount(
  units: number,
  rate: Pick<RateConfigForCalc, "amount" | "formulaType" | "percentage">,
  salary: SalaryBasis
): number {
  if (units <= 0) return 0;
  return roundMoney(units * resolveUnitAmount(rate, salary));
}

/** 由底薪與月工時推算時薪 */
export function deriveHourlyRateFromBase(
  baseSalary: number,
  normalHours: number
): number {
  if (baseSalary <= 0 || normalHours <= 0) return 0;
  return roundMoney(baseSalary / normalHours);
}

export function describeRateFormula(
  rate: Pick<RateConfigForCalc, "amount" | "formulaType" | "percentage" | "itemKey">,
  unitLabel: string
): string {
  if (rate.formulaType === "base_salary_percent") {
    return `單位 × 底薪 × ${rate.percentage}%（${unitLabel}）`;
  }
  if (rate.formulaType === "hourly_rate") {
    const mult = rate.amount > 0 ? rate.amount : 1;
    return `單位 × 時薪 × ${mult}（${unitLabel}）`;
  }
  return `單位 × ${rate.amount.toLocaleString()} 元（${unitLabel}）`;
}
