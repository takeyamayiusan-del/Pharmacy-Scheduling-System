export type PayrollFormulaType =
  // 小時公式
  | "fixed_per_hour"
  | "base_salary_percent_per_hour"
  | "hourly_rate_per_hour"
  // 分鐘公式
  | "fixed_per_minute"
  | "base_salary_percent_per_minute"
  | "hourly_rate_per_minute"
  // 舊版相容（依實際傳入的單位直接乘，不換算）
  | "fixed_amount"
  | "base_salary_percent"
  | "hourly_rate";

export type RateInputUnit = "hour" | "minute";

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
  group: "hour" | "minute" | "legacy";
}> = [
  {
    value: "fixed_per_hour",
    label: "【小時】時數 × 固定金額",
    hint: "例如：請假／加班 8 小時 × 150 元",
    group: "hour",
  },
  {
    value: "base_salary_percent_per_hour",
    label: "【小時】時數 × 底薪 × 百分比",
    hint: "例如：8 小時 ×（底薪 × 0.4167%）≈ 月薪／240",
    group: "hour",
  },
  {
    value: "hourly_rate_per_hour",
    label: "【小時】時數 × 時薪 × 倍數",
    hint: "例如：加班 2 小時 × 時薪 × 1.34（倍數填在金額）",
    group: "hour",
  },
  {
    value: "fixed_per_minute",
    label: "【分鐘】分鐘 × 固定金額",
    hint: "例如：遲到 30 分鐘 × 2 元",
    group: "minute",
  },
  {
    value: "base_salary_percent_per_minute",
    label: "【分鐘】分鐘 × 底薪 × 百分比",
    hint: "例如：遲到分鐘 ×（底薪 × 0.00695%）≈ 時薪／60",
    group: "minute",
  },
  {
    value: "hourly_rate_per_minute",
    label: "【分鐘】分鐘 ×（時薪÷60）× 倍數",
    hint: "例如：遲到 30 分鐘 ×（時薪÷60）× 1（倍數填在金額）",
    group: "minute",
  },
];

/** 將資料庫舊值正規化成可用公式 */
export function normalizePayrollFormulaType(
  raw: string | null | undefined
): PayrollFormulaType {
  const value = (raw || "fixed_amount") as PayrollFormulaType;
  const known = new Set(FORMULA_TYPE_OPTIONS.map((o) => o.value));
  known.add("fixed_amount");
  known.add("base_salary_percent");
  known.add("hourly_rate");
  if (known.has(value)) return value;

  // 舊版別名對應
  if (raw === "fixed_amount") return "fixed_amount";
  if (raw === "base_salary_percent") return "base_salary_percent";
  if (raw === "hourly_rate") return "hourly_rate";
  return "fixed_amount";
}

export function getFormulaUnitBasis(
  formulaType: PayrollFormulaType
): RateInputUnit | "auto" {
  if (
    formulaType === "fixed_per_hour" ||
    formulaType === "base_salary_percent_per_hour" ||
    formulaType === "hourly_rate_per_hour"
  ) {
    return "hour";
  }
  if (
    formulaType === "fixed_per_minute" ||
    formulaType === "base_salary_percent_per_minute" ||
    formulaType === "hourly_rate_per_minute"
  ) {
    return "minute";
  }
  return "auto";
}

export function roundMoney(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

/** 將實際單位換算成公式使用的單位 */
export function convertUnitsForFormula(
  units: number,
  inputUnit: RateInputUnit,
  formulaType: PayrollFormulaType
): number {
  const basis = getFormulaUnitBasis(formulaType);
  if (basis === "auto" || basis === inputUnit) return units;
  if (inputUnit === "minute" && basis === "hour") return units / 60;
  if (inputUnit === "hour" && basis === "minute") return units * 60;
  return units;
}

/**
 * 依費率公式計算「每一公式單位」金額（內部未四捨五入，供連乘）。
 * - fixed_*：直接用 amount
 * - base_salary_percent_*：底薪 × (percentage/100)
 * - hourly_rate_per_hour：時薪 × 倍數
 * - hourly_rate_per_minute：（時薪÷60）× 倍數
 */
function resolveUnitAmountRaw(
  rate: Pick<RateConfigForCalc, "amount" | "formulaType" | "percentage">,
  salary: SalaryBasis
): number {
  const type = rate.formulaType;

  if (
    type === "base_salary_percent" ||
    type === "base_salary_percent_per_hour" ||
    type === "base_salary_percent_per_minute"
  ) {
    return Math.max(0, salary.baseSalary * (rate.percentage / 100));
  }

  if (type === "hourly_rate" || type === "hourly_rate_per_hour") {
    const multiplier = rate.amount > 0 ? rate.amount : 1;
    return Math.max(0, salary.hourlyRate * multiplier);
  }

  if (type === "hourly_rate_per_minute") {
    const multiplier = rate.amount > 0 ? rate.amount : 1;
    return Math.max(0, (salary.hourlyRate / 60) * multiplier);
  }

  return Math.max(0, rate.amount);
}

export function resolveUnitAmount(
  rate: Pick<RateConfigForCalc, "amount" | "formulaType" | "percentage">,
  salary: SalaryBasis
): number {
  return roundMoney(resolveUnitAmountRaw(rate, salary));
}

/** 單位數量 × 單位金額（會依小時／分鐘公式自動換算） */
export function calculateRateAmount(
  units: number,
  rate: Pick<RateConfigForCalc, "amount" | "formulaType" | "percentage">,
  salary: SalaryBasis,
  inputUnit: RateInputUnit = "hour"
): number {
  if (units <= 0) return 0;
  const formulaUnits = convertUnitsForFormula(units, inputUnit, rate.formulaType);
  return roundMoney(formulaUnits * resolveUnitAmountRaw(rate, salary));
}

/** 由底薪與月工時推算時薪 */
export function deriveHourlyRateFromBase(
  baseSalary: number,
  normalHours: number
): number {
  if (baseSalary <= 0 || normalHours <= 0) return 0;
  return roundMoney(baseSalary / normalHours);
}

/** 勞基法口徑：月薪先換日薪（月薪÷30），再換時薪（日薪÷每日工時） */
export function deriveHourlyRateByLaborStandard(
  baseSalary: number,
  dailyHours = 8
): number {
  if (baseSalary <= 0 || dailyHours <= 0) return 0;
  return roundMoney(baseSalary / 30 / dailyHours);
}

export function isPercentageFormula(formulaType: PayrollFormulaType): boolean {
  return (
    formulaType === "base_salary_percent" ||
    formulaType === "base_salary_percent_per_hour" ||
    formulaType === "base_salary_percent_per_minute"
  );
}

export function isHourlyMultiplierFormula(formulaType: PayrollFormulaType): boolean {
  return (
    formulaType === "hourly_rate" ||
    formulaType === "hourly_rate_per_hour" ||
    formulaType === "hourly_rate_per_minute"
  );
}

export function describeRateFormula(
  rate: Pick<RateConfigForCalc, "amount" | "formulaType" | "percentage" | "itemKey">,
  unitLabel: string
): string {
  const type = rate.formulaType;
  if (
    type === "base_salary_percent" ||
    type === "base_salary_percent_per_hour"
  ) {
    return `時數 × 底薪 × ${rate.percentage}%`;
  }
  if (type === "base_salary_percent_per_minute") {
    return `分鐘 × 底薪 × ${rate.percentage}%`;
  }
  if (type === "hourly_rate" || type === "hourly_rate_per_hour") {
    const mult = rate.amount > 0 ? rate.amount : 1;
    return `時數 × 時薪 × ${mult}`;
  }
  if (type === "hourly_rate_per_minute") {
    const mult = rate.amount > 0 ? rate.amount : 1;
    return `分鐘 ×（時薪÷60）× ${mult}`;
  }
  if (type === "fixed_per_hour") {
    return `時數 × ${rate.amount.toLocaleString()} 元`;
  }
  if (type === "fixed_per_minute") {
    return `分鐘 × ${rate.amount.toLocaleString()} 元`;
  }
  return `單位 × ${rate.amount.toLocaleString()} 元（${unitLabel}）`;
}

/** 依費率項目建議預設公式（遲到用分鐘、其餘用小時） */
export function suggestFormulaTypeForItem(itemKey: string): PayrollFormulaType {
  if (itemKey.includes("min") || itemKey.includes("tardiness")) {
    return "fixed_per_minute";
  }
  return "fixed_per_hour";
}
