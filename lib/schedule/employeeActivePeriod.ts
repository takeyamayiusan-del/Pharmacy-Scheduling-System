import { parseLocalDateParts } from "@/lib/schedule/sundayRest";

export type EmployeeActivePeriod = {
  hireDate?: string | null;
  endDate?: string | null;
};

/** 本地日曆 YYYY-MM-DD 字串比較（同格式可直接字典序比較） */
export function isEmployeeActiveOnDate(
  employee: EmployeeActivePeriod,
  dateStr: string
): boolean {
  if (!parseLocalDateParts(dateStr)) return false;
  const hire = (employee.hireDate || "").trim();
  const end = (employee.endDate || "").trim();
  if (hire && dateStr < hire) return false;
  if (end && dateStr > end) return false;
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
  const hire = (employee.hireDate || "").trim();
  const end = (employee.endDate || "").trim();
  if (hire && hire > monthEnd) return false;
  if (end && end < monthStart) return false;
  return true;
}
