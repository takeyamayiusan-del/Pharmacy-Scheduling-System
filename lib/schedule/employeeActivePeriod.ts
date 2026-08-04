import { parseLocalDateParts } from "@/lib/schedule/sundayRest";

export type EmployeeActivePeriod = {
  hireDate?: string | null;
  endDate?: string | null;
};

function normalizeDateKey(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const direct = parseLocalDateParts(trimmed);
  if (direct) return trimmed;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(trimmed);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** 本地日曆日期比較（normalize 後以 YYYY-MM-DD 字串比較） */
export function isEmployeeActiveOnDate(
  employee: EmployeeActivePeriod,
  dateStr: string
): boolean {
  const target = normalizeDateKey(dateStr);
  if (!target) return false;
  const hire = normalizeDateKey(employee.hireDate);
  const end = normalizeDateKey(employee.endDate);
  if (hire && target < hire) return false;
  if (end && target > end) return false;
  return true;
}

/** 該月是否有任何一天仍在職（入職～到期） */
export function isEmployeeActiveInMonth(
  employee: EmployeeActivePeriod,
  year: number,
  month: number
): boolean {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const hire = normalizeDateKey(employee.hireDate);
  const end = normalizeDateKey(employee.endDate);
  if (hire && hire > monthEnd) return false;
  if (end && end < monthStart) return false;
  return true;
}
