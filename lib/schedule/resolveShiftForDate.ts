import { normalizeCalendarDate } from "@/lib/schedule/sundayRest";

export function isLeaveSelectedOnDate(
  selectedDates: string[] | undefined,
  date: string
): boolean {
  const dateKey = normalizeCalendarDate(date);
  if (!dateKey) return false;
  return (selectedDates ?? []).some((d) => normalizeCalendarDate(d) === dateKey);
}

/**
 * 月曆式／個人班表實際顯示班別。
 * 排休勾選必須優先於班表覆寫，否則鎖月或套用預設班後，平日排休仍會顯示預設班別。
 */
export function resolveShiftForDate<T extends string>(input: {
  isSunday: boolean;
  isActive: boolean;
  saturdayFixedOff: boolean;
  leaveSelected: boolean;
  /** 半天排休：剩下半天要上的班碼；有值時不顯示全日 X */
  halfDayWorkShift?: T | null;
  override?: T | null;
  baseWorkShift: T;
}): T | "X" {
  if (input.isSunday || !input.isActive) return "X";
  if (input.saturdayFixedOff) return "X";
  if (input.leaveSelected) {
    const half = input.halfDayWorkShift;
    if (half && half !== "X") return half;
    return "X";
  }
  if (input.override) return input.override;
  return input.baseWorkShift;
}
