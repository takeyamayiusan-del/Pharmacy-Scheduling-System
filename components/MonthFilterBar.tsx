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

export type EmployeeFilterOption = { id: string; name: string };

type MonthFilterBarProps = {
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  label?: string;
  count?: number;
  className?: string;
  /** 店長／老闆核對時數用：篩選單一員工（空字串＝全部） */
  employeeFilter?: {
    value: string;
    onChange: (employeeId: string) => void;
    options: EmployeeFilterOption[];
    label?: string;
  };
  /** 篩選後核准時數合計等提示 */
  summaryText?: string;
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
  employeeFilter,
  summaryText,
}: MonthFilterBarProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      <span className="text-sm text-slate-600">{label}</span>
      <select
        value={year}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white/90"
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
        className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white/90"
        aria-label="月份"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m} 月
          </option>
        ))}
      </select>
      {employeeFilter && (
        <>
          <span className="text-sm text-slate-600">
            {employeeFilter.label ?? "篩選員工"}
          </span>
          <select
            value={employeeFilter.value}
            onChange={(e) => employeeFilter.onChange(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm bg-white/90 min-w-[8rem]"
            aria-label="篩選員工"
          >
            <option value="">全部員工</option>
            {employeeFilter.options.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </>
      )}
      {typeof count === "number" && (
        <span className="text-xs text-slate-500">共 {count} 筆</span>
      )}
      {summaryText && (
        <span className="text-xs font-medium text-sky-800 bg-sky-50 border border-sky-100 rounded-full px-2.5 py-1">
          {summaryText}
        </span>
      )}
    </div>
  );
}
