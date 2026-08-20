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

/** 瀏覽器 time input 可能是 HH:MM 或 HH:MM:SS；寫入 Postgres TIME 用 HH:MM:SS */
export function normalizeRequestedTime(raw: unknown): string | null {
  const t = String(raw ?? "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export function friendlyPunchCorrectionDbError(message: string | null | undefined): string {
  const msg = String(message ?? "");
  if (/schema cache|does not exist|relation .*punch_correction|permission denied/i.test(msg)) {
    return "網站還沒讀到打卡補登表，請授權 service_role／authenticated 並執行 NOTIFY pgrst, 'reload schema'";
  }
  if (/invalid input syntax for type time/i.test(msg)) {
    return "時間格式不正確，請再選一次希望登記時間";
  }
  return msg.trim() || "送出失敗";
}
