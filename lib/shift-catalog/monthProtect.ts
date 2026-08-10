/**
 * 班別目錄變更防護：當月班表已使用的識別碼不可刪／改碼；下個月再調整。
 */

export type ScheduleByDate = Record<string, Record<string, string>>;

export type FixedShiftLike = {
  employeeId: string;
  shift: string;
};

/** YYYY-MM（本地月） */
export function formatMonthKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatMonthLabelZh(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  const month = Number(m);
  if (!y || !Number.isFinite(month)) return monthKey;
  return `${y}年${month}月`;
}

export function isDateInMonthKey(dateStr: string, monthKey: string): boolean {
  return typeof dateStr === "string" && dateStr.startsWith(`${monthKey}-`);
}

/** 本月班表（schedule_entries）用到的班別碼 */
export function collectShiftCodesUsedInMonth(
  schedule: ScheduleByDate,
  monthKey: string,
  siteEmployeeIds?: Set<string>
): Set<string> {
  const used = new Set<string>();
  for (const [date, byUser] of Object.entries(schedule ?? {})) {
    if (!isDateInMonthKey(date, monthKey)) continue;
    for (const [userId, code] of Object.entries(byUser ?? {})) {
      if (siteEmployeeIds && !siteEmployeeIds.has(userId)) continue;
      if (code && code !== "X") used.add(code);
    }
  }
  return used;
}

/** 本店固定班用到的班別碼（會影響當月與之後各月） */
export function collectFixedShiftCodes(
  fixedShifts: FixedShiftLike[],
  siteEmployeeIds?: Set<string>
): Set<string> {
  const used = new Set<string>();
  for (const fs of fixedShifts ?? []) {
    if (siteEmployeeIds && !siteEmployeeIds.has(fs.employeeId)) continue;
    if (fs.shift && fs.shift !== "X") used.add(fs.shift);
  }
  return used;
}

export type CatalogIdentityAction = "delete" | "rename";

export type CatalogIdentityGuardResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * 刪除班別或更改識別碼時：
 * - 當月班表已使用 → 擋下（這個月不動，下個月再動）
 * - 固定班仍使用 → 擋下（請先改固定班）
 */
export function guardCatalogIdentityChange(opts: {
  action: CatalogIdentityAction;
  code: string;
  monthKey?: string;
  usedInCurrentMonth: boolean;
  usedInFixedShifts: boolean;
}): CatalogIdentityGuardResult {
  const code = opts.code.trim();
  if (!code) return { ok: true };

  const monthKey = opts.monthKey ?? formatMonthKey();
  const monthLabel = formatMonthLabelZh(monthKey);
  const actionLabel = opts.action === "delete" ? "刪除" : "更改識別碼";

  if (opts.usedInCurrentMonth) {
    return {
      ok: false,
      message: `「${code}」在${monthLabel}班表已有排班，本月請勿${actionLabel}。請等下個月再調整，或先只改名稱／短碼／顏色／時段。`,
    };
  }

  if (opts.usedInFixedShifts) {
    return {
      ok: false,
      message: `「${code}」仍在固定班表中。請先到「固定班表」改成其他班別後，再${actionLabel}；建議下個月再生效。`,
    };
  }

  return { ok: true };
}

export function buildCurrentMonthShiftUsage(opts: {
  schedule: ScheduleByDate;
  fixedShifts: FixedShiftLike[];
  siteEmployeeIds: Set<string>;
  now?: Date;
}): {
  monthKey: string;
  monthLabel: string;
  usedInMonth: Set<string>;
  usedInFixed: Set<string>;
} {
  const monthKey = formatMonthKey(opts.now ?? new Date());
  return {
    monthKey,
    monthLabel: formatMonthLabelZh(monthKey),
    usedInMonth: collectShiftCodesUsedInMonth(
      opts.schedule,
      monthKey,
      opts.siteEmployeeIds
    ),
    usedInFixed: collectFixedShiftCodes(opts.fixedShifts, opts.siteEmployeeIds),
  };
}
