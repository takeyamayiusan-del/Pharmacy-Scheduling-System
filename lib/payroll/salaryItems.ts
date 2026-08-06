/** 員工薪資結構：合約底薪／職位加級／固定津貼獎金（含全勤規則） */

export type SalaryItemCategory = "position_grade" | "fixed_allowance";

export type SalaryItemPresetKey = "full_attendance" | "shift_package";

export type EmployeeSalaryItem = {
  id: string;
  userId: string;
  category: SalaryItemCategory;
  label: string;
  amount: number;
  presetKey: SalaryItemPresetKey | null;
  countsAsWage: boolean;
  isEnabled: boolean;
  sortOrder: number;
};

export type SalaryItemDraft = Omit<EmployeeSalaryItem, "id" | "userId"> & {
  id?: string;
  userId?: string;
};

/** 請假時數（依假別彙總，用於全勤計算） */
export type LeaveHoursByType = Partial<Record<string, number>>;

export type FullAttendanceCalcInput = {
  configuredAmount: number;
  /** 本月各假別已核准時數 */
  leaveHoursByType: LeaveHoursByType;
  /** 近一年普通病假日數（時數／8），供提示用 */
  yearlySickLeaveDays?: number;
  /** 一日以幾小時換算（預設 8） */
  hoursPerDay?: number;
};

export type FullAttendanceCalcResult = {
  configuredAmount: number;
  paidAmount: number;
  sickDays: number;
  personalLeaveDays: number;
  sickDeduction: number;
  personalLeaveDeduction: number;
  protectedLeaveHours: number;
  yearlySickLeaveDays: number;
  /** 一年內病假未滿 10 日：不得作不利處分提示 */
  yearlySickUnderTenDays: boolean;
  notes: string[];
};

/** 不得因該假別扣發全勤（系統既有假別對應） */
export const FULL_ATTENDANCE_PROTECTED_LEAVE_TYPES = [
  "喪假",
  "特休",
  "補休假",
  "其他", // 公假／公傷／生理假等請歸此類或另開假別時不扣
] as const;

export const SALARY_ITEM_PRESETS: Array<{
  presetKey: SalaryItemPresetKey | null;
  category: SalaryItemCategory;
  label: string;
  countsAsWage: boolean;
  description: string;
}> = [
  {
    presetKey: null,
    category: "position_grade",
    label: "職位加級",
    countsAsWage: true,
    description: "合約約定加給，屬應給付工資",
  },
  {
    presetKey: "full_attendance",
    category: "fixed_allowance",
    label: "全勤獎金",
    countsAsWage: true,
    description: "屬工資；病假按日扣 1/30；婚喪／公傷／公假／生理假／照顧家人事假不得扣發",
  },
  {
    presetKey: "shift_package",
    category: "fixed_allowance",
    label: "包班獎金",
    countsAsWage: false,
    description: "固定津貼，可依公司規定是否計入工資",
  },
];

export function hoursToLeaveDays(hours: number, hoursPerDay = 8): number {
  if (hoursPerDay <= 0) return 0;
  return Math.round((hours / hoursPerDay) * 1000) / 1000;
}

/**
 * 全勤獎金本月實發
 * - 屬工資（呼叫端計入加班基數）
 * - 普通病假：每日最多扣當月全勤的 1/30，不得一次歸零
 * - 喪假／特休／補休／其他（公假等）：不扣
 * - 事假：按日扣 1/30（照顧家人事假依法不得扣；系統尚無細分時於 notes 提示）
 */
export function calculateFullAttendancePay(
  input: FullAttendanceCalcInput
): FullAttendanceCalcResult {
  const hoursPerDay = input.hoursPerDay ?? 8;
  const configured = Math.max(0, Number(input.configuredAmount) || 0);
  const byType = input.leaveHoursByType ?? {};

  const sickHours = Number(byType["病假"] ?? 0);
  const personalHours = Number(byType["事假"] ?? 0);
  const protectedLeaveHours = FULL_ATTENDANCE_PROTECTED_LEAVE_TYPES.reduce(
    (sum, t) => sum + Number(byType[t] ?? 0),
    0
  );

  const sickDays = hoursToLeaveDays(sickHours, hoursPerDay);
  const personalLeaveDays = hoursToLeaveDays(personalHours, hoursPerDay);

  const sickDeduction = Math.round(configured * (sickDays / 30));
  const personalLeaveDeduction = Math.round(configured * (personalLeaveDays / 30));
  const paidAmount = Math.max(0, configured - sickDeduction - personalLeaveDeduction);

  const yearlySickLeaveDays = input.yearlySickLeaveDays ?? 0;
  const yearlySickUnderTenDays = yearlySickLeaveDays < 10;

  const notes: string[] = [];
  if (protectedLeaveHours > 0) {
    notes.push("喪假／特休／補休／其他（公假等）不扣全勤獎金。");
  }
  if (personalHours > 0) {
    notes.push("事假目前按日扣 1/30；若屬照顧家人請事假，依法不得扣發，請人工調整。");
  }
  if (sickDays > 0) {
    notes.push(`普通病假 ${sickDays} 日，全勤按日扣 1/30（不得一次歸零）。`);
  }
  if (yearlySickUnderTenDays) {
    notes.push("一年內普通病假未滿 10 日：不得因此給予不利處分（考績／取消全勤資格等）。");
  }

  return {
    configuredAmount: configured,
    paidAmount,
    sickDays,
    personalLeaveDays,
    sickDeduction,
    personalLeaveDeduction,
    protectedLeaveHours,
    yearlySickLeaveDays,
    yearlySickUnderTenDays,
    notes,
  };
}

export function sumSalaryItems(
  items: Array<Pick<EmployeeSalaryItem, "amount" | "isEnabled" | "category">>,
  category: SalaryItemCategory
): number {
  return items
    .filter((i) => i.isEnabled && i.category === category)
    .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
}

/** 合約應給：底薪 + 職位加級 */
export function contractualPay(baseSalary: number, items: EmployeeSalaryItem[]): number {
  return Math.round((Number(baseSalary) || 0) + sumSalaryItems(items, "position_grade"));
}

/** 計入工資／加班基數：底薪 + 標記 countsAsWage 的加級與固定項（全勤用設定額） */
export function wageBaseForOvertime(
  baseSalary: number,
  items: EmployeeSalaryItem[]
): number {
  const extras = items
    .filter((i) => i.isEnabled && i.countsAsWage)
    .reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
  return Math.round((Number(baseSalary) || 0) + extras);
}

export function newDraftItem(
  preset: (typeof SALARY_ITEM_PRESETS)[number],
  sortOrder = 0
): SalaryItemDraft {
  return {
    category: preset.category,
    label: preset.label,
    amount: 0,
    presetKey: preset.presetKey,
    countsAsWage: preset.countsAsWage,
    isEnabled: true,
    sortOrder,
  };
}

export function mapSalaryItemRow(r: Record<string, unknown>): EmployeeSalaryItem {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    category: r.category as SalaryItemCategory,
    label: String(r.label ?? ""),
    amount: Number(r.amount ?? 0),
    presetKey: (r.preset_key as SalaryItemPresetKey | null) ?? null,
    countsAsWage: Boolean(r.counts_as_wage),
    isEnabled: r.is_enabled !== false,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export type LeaveRequestLike = {
  employeeId: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  leaveHours: number;
};

/** 近一年（含結算月末）普通病假約當日數 */
export function getYearlySickLeaveDays(params: {
  employeeId: string;
  leaveRequests: LeaveRequestLike[];
  asOfYear: number;
  asOfMonth: number;
  hoursPerDay?: number;
}): number {
  const hoursPerDay = params.hoursPerDay ?? 8;
  const asOf = new Date(params.asOfYear, params.asOfMonth, 0); // 月末
  const from = new Date(asOf);
  from.setFullYear(from.getFullYear() - 1);
  const fromStr = from.toISOString().slice(0, 10);
  const asOfStr = asOf.toISOString().slice(0, 10);

  const hours = params.leaveRequests
    .filter(
      (r) =>
        r.employeeId === params.employeeId &&
        r.status === "approved" &&
        r.type === "病假" &&
        r.endDate >= fromStr &&
        r.startDate <= asOfStr
    )
    .reduce((acc, r) => acc + (Number(r.leaveHours) || 0), 0);

  return hoursToLeaveDays(hours, hoursPerDay);
}
