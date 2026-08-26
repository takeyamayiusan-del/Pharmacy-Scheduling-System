import { roundCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";

/** 補休假扣帳時數：優先用申請紀錄，否則依時段推估 */
export function resolveCompLeaveDebitHours(params: {
  leaveHours: number | null | undefined;
  period?: string | null;
  /** 全日工時（店規 leaveHoursPerDay，預設 8） */
  leaveHoursPerDay?: number;
}): number {
  const stored = Number(params.leaveHours);
  if (Number.isFinite(stored) && stored > 0) {
    return roundCompLeaveHours(stored);
  }
  const day = Math.max(1, Number(params.leaveHoursPerDay) || 8);
  const period = String(params.period ?? "full_day");
  if (period === "morning" || period === "afternoon") {
    return roundCompLeaveHours(day / 2);
  }
  return roundCompLeaveHours(day);
}

export function buildCompLeaveDebitNote(params: {
  isAdvance: boolean;
  startDate: string;
  endDate: string;
  backfill?: boolean;
}): string {
  const range =
    params.endDate && params.endDate !== params.startDate
      ? `${params.startDate}～${params.endDate}`
      : params.startDate;
  if (params.backfill) {
    return params.isAdvance
      ? `補登：核准補休假補扣（借支） ${range}`
      : `補登：核准補休假補扣 ${range}`;
  }
  return params.isAdvance
    ? `先請補休（借支） ${range}`
    : `請假使用補休 ${range}`;
}
