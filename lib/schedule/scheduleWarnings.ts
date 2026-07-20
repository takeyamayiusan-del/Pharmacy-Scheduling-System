import type { Employee, ShiftDisplayConfig, ShiftType } from "@/lib/context/AppContext";
import { formatShiftName } from "./shiftLabels";

const isSunday = (dateStr: string) => new Date(dateStr).getDay() === 0;
const isSaturday = (dateStr: string) => new Date(dateStr).getDay() === 6;

export type ScheduleWarning = {
  dateStr: string;
  day: number;
  messages: string[];
};

/** 禮拜六預設上午班；平日檢查全天班是否有人 */
const SATURDAY_MORNING_SHIFT: ShiftType = "C";
const WEEKDAY_FULL_SHIFT: ShiftType = "A";
const MIN_SATURDAY_WORKERS = 2;

export function buildScheduleWarnings(options: {
  year: number;
  month: number;
  daysInMonth: number;
  employees: Employee[];
  shiftDisplayConfig: ShiftDisplayConfig;
  getShiftForDate: (date: string, employeeId: string) => ShiftType;
}): ScheduleWarning[] {
  const { year, month, daysInMonth, employees, shiftDisplayConfig, getShiftForDate } =
    options;
  const staff = employees.filter((emp) => emp.role !== "owner");

  return Array.from({ length: daysInMonth }, (_, index) => index + 1)
    .map((day) => {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isSunday(dateStr)) return null;

      const workers = staff.map((emp) => ({
        emp,
        shift: getShiftForDate(dateStr, emp.id),
      }));
      const messages: string[] = [];

      if (isSaturday(dateStr)) {
        const working = workers.filter((w) => w.shift !== "X");
        const morning = workers.filter((w) => w.shift === SATURDAY_MORNING_SHIFT);
        if (morning.length === 0) {
          messages.push(
            `沒有人上${formatShiftName(shiftDisplayConfig, SATURDAY_MORNING_SHIFT)}`
          );
        }
        if (working.length === 0) {
          messages.push("禮拜六無人上班");
        } else if (working.length < MIN_SATURDAY_WORKERS) {
          messages.push(
            `僅 ${working.map((w) => w.emp.name).join("、")} 上班，禮拜六至少需要 ${MIN_SATURDAY_WORKERS} 人`
          );
        }
      } else {
        const resting = workers.filter((w) => w.shift === "X").map((w) => w.emp.name);
        const fullDayWorkers = workers
          .filter((w) => w.shift === WEEKDAY_FULL_SHIFT)
          .map((w) => w.emp.name);
        if (resting.length > 1) {
          messages.push(`平日多人休假：${resting.join("、")}`);
        }
        if (fullDayWorkers.length === 0) {
          messages.push(
            `沒有人上${formatShiftName(shiftDisplayConfig, WEEKDAY_FULL_SHIFT)}`
          );
        }
      }

      if (messages.length === 0) return null;
      return { dateStr, day, messages };
    })
    .filter(Boolean) as ScheduleWarning[];
}
