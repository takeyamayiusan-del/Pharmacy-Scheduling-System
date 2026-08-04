"use client";

export function getCurrentYearMonth(now = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function getMonthBounds(year: number, month: number) {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(year, month, 0).getDate();
  return {
    monthStart: `${monthStr}-01`,
    monthEnd: `${monthStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** 單一日是否落在指定年月 */
export function isDateInYearMonth(dateValue: string | null | undefined, year: number, month: number) {
  if (!dateValue) return false;
  const match = String(dateValue).match(/^(\d{4})-(\d{2})/);
  if (!match) return false;
  return Number(match[1]) === year && Number(match[2]) === month;
}

/** 日期區間是否與指定月份有重疊（請假用） */
export function doesRangeOverlapYearMonth(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  year: number,
  month: number
) {
  if (!startDate || !endDate) return false;
  const start = String(startDate).slice(0, 10);
  const end = String(endDate).slice(0, 10);
  const { monthStart, monthEnd } = getMonthBounds(year, month);
  return end >= monthStart && start <= monthEnd;
}

type MonthFilterBarProps = {
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  label?: string;
  count?: number;
  className?: string;
};

/** 年／月下拉列，供各申請與遲到列表共用 */
export function MonthFilterBar({
  year,
  month,
  onYearChange,
  onMonthChange,
  label = "顯示月份",
  count,
  className = "",
}: MonthFilterBarProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <select
        value={year}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="border rounded-lg px-3 py-1.5 text-sm"
        aria-label="年份"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y} 年
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onMonthChange(Number(e.target.value))}
        className="border rounded-lg px-3 py-1.5 text-sm"
        aria-label="月份"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m} 月
          </option>
        ))}
      </select>
      {typeof count === "number" && (
        <span className="text-xs text-gray-500">共 {count} 筆</span>
      )}
    </div>
  );
}
