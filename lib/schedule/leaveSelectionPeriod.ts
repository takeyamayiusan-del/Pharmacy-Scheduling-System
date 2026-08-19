export type LeaveSelectionPeriod = "full_day" | "morning" | "afternoon";

export type LeaveSelectionDetail = {
  period: LeaveSelectionPeriod;
  workShift: string | null;
};

export type LeaveSelectionMetaMap = Record<string, Record<string, LeaveSelectionDetail>>;

export function parseLeaveSelectionPeriod(raw: unknown): LeaveSelectionPeriod {
  if (raw === "morning" || raw === "afternoon") return raw;
  return "full_day";
}

export function isHalfDayLeavePeriod(period: LeaveSelectionPeriod | null | undefined): boolean {
  return period === "morning" || period === "afternoon";
}

export function halfDayLeaveLabel(period: LeaveSelectionPeriod): string {
  if (period === "morning") return "休上午";
  if (period === "afternoon") return "休下午";
  return "全日";
}

export function halfDayLeaveNote(period: LeaveSelectionPeriod): string | null {
  if (period === "morning") return "上午排休";
  if (period === "afternoon") return "下午排休";
  return null;
}

export function getLeaveSelectionDetail(
  meta: LeaveSelectionMetaMap | undefined,
  employeeId: string,
  date: string
): LeaveSelectionDetail | null {
  return meta?.[employeeId]?.[date] ?? null;
}
