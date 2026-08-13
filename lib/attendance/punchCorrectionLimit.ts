/** 本月（當地日曆月）打卡補登申請次數：pending + approved 計入，駁回不佔。 */

export function currentMonthCreatedAtRange(now = new Date()): {
  startIso: string;
  endIso: string;
  year: number;
  month: number;
} {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startIso = new Date(year, now.getMonth(), 1).toISOString();
  const endIso = new Date(year, now.getMonth() + 1, 1).toISOString();
  return { startIso, endIso, year, month };
}

export function punchCorrectionQuotaText(
  used: number,
  limit: number | null
): string {
  if (limit == null) return `本月已申請 ${used} 次（不限）`;
  return `本月已申請 ${used} / ${limit} 次`;
}

export function punchCorrectionOverLimitMessage(limit: number): string {
  return `本月打卡補登已達 ${limit} 次上限，請改由店長在「打卡管理」代改`;
}

export function isPunchCorrectionOverLimit(
  used: number,
  limit: number | null
): boolean {
  if (limit == null) return false;
  return used >= limit;
}
