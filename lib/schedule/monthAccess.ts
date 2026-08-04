/** 月份／日期是否可編輯（排休選擇、班表、申請） */

export function isPastMonth(year: number, month: number): boolean {
  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const targetMonthStart = new Date(year, month - 1, 1).getTime();
  return targetMonthStart < currentMonthStart;
}

export function isPastDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  return isPastMonth(date.getFullYear(), date.getMonth() + 1);
}

/** 當月第一天，供 date input min 使用 */
export function currentMonthMinDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function hasPastMonthInRange(startDate: string, endDate: string): boolean {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    if (isPastMonth(cursor.getFullYear(), cursor.getMonth() + 1)) return true;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return false;
}
