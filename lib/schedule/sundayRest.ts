/** 禮拜日固定公休：全店規則，換班／班表覆寫不可破壞 */

export function parseLocalDateParts(dateStr: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** 本地日曆星期（0=日…6=六），避免 UTC 解析偏差 */
export function getLocalDayOfWeek(dateStr: string): number {
  const parts = parseLocalDateParts(dateStr);
  if (!parts) return -1;
  return new Date(parts.y, parts.m - 1, parts.d).getDay();
}

/** 以本地日曆判斷星期，避免 `new Date('YYYY-MM-DD')` UTC 解析偏差 */
export function isFixedSundayRest(dateStr: string): boolean {
  return getLocalDayOfWeek(dateStr) === 0;
}

export function isLocalSaturday(dateStr: string): boolean {
  return getLocalDayOfWeek(dateStr) === 6;
}

export function isLocalTuesday(dateStr: string): boolean {
  return getLocalDayOfWeek(dateStr) === 2;
}

export function isLocalWednesday(dateStr: string): boolean {
  return getLocalDayOfWeek(dateStr) === 3;
}

export const SUNDAY_REST_MESSAGE = "禮拜日為固定公休，不可換班或改為上班";

export function assertNoSundayInSwapDates(
  requesterDate: string,
  targetDate: string
): { ok: true } | { ok: false; message: string } {
  if (isFixedSundayRest(requesterDate) || isFixedSundayRest(targetDate)) {
    return { ok: false, message: SUNDAY_REST_MESSAGE };
  }
  return { ok: true };
}

export function assertSundayShiftAllowed(
  date: string,
  shift: string
): { ok: true } | { ok: false; message: string } {
  if (!isFixedSundayRest(date)) return { ok: true };
  if (shift === "X") return { ok: true };
  return { ok: false, message: SUNDAY_REST_MESSAGE };
}

/** 換班寫入前：禮拜日格子強制維持 X（防呆） */
export function enforceSundayRestOnChanges<T extends { date: string; shift: string }>(
  changes: T[]
): T[] {
  return changes.map((c) =>
    isFixedSundayRest(c.date) ? { ...c, shift: "X" } : c
  );
}
