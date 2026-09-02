export type LeaveSelectionPeriod = "full_day" | "morning" | "afternoon" | "shift_rest";

export type LeaveSelectionDetail = {
  period: LeaveSelectionPeriod;
  workShift: string | null;
};

export type LeaveSelectionMetaMap = Record<string, Record<string, LeaveSelectionDetail>>;

export function parseLeaveSelectionPeriod(raw: unknown): LeaveSelectionPeriod {
  if (raw === "morning" || raw === "afternoon" || raw === "shift_rest") return raw;
  return "full_day";
}

/** 舊制：休上午／休下午（仍相容歷史資料） */
export function isHalfDayLeavePeriod(period: LeaveSelectionPeriod | null | undefined): boolean {
  return period === "morning" || period === "afternoon";
}

/** 集集等：排休日改排特定班別（非全日休假 X） */
export function isShiftRestLeavePeriod(period: LeaveSelectionPeriod | null | undefined): boolean {
  return period === "shift_rest";
}

/** 排休選擇後班表應顯示 workShift 而非休假 */
export function leaveSelectionUsesWorkShift(
  detail: LeaveSelectionDetail | null | undefined
): boolean {
  if (!detail?.workShift || detail.workShift === "X") return false;
  return isShiftRestLeavePeriod(detail.period) || isHalfDayLeavePeriod(detail.period);
}

export function halfDayLeaveLabel(period: LeaveSelectionPeriod): string {
  if (period === "morning") return "休上午";
  if (period === "afternoon") return "休下午";
  if (period === "shift_rest") return "特定班別";
  return "全日";
}

export function halfDayLeaveNote(period: LeaveSelectionPeriod): string | null {
  if (period === "morning") return "上午排休";
  if (period === "afternoon") return "下午排休";
  if (period === "shift_rest") return "排休（特定班別）";
  return null;
}

export function getLeaveSelectionDetail(
  meta: LeaveSelectionMetaMap | undefined,
  employeeId: string,
  date: string
): LeaveSelectionDetail | null {
  return meta?.[employeeId]?.[date] ?? null;
}
