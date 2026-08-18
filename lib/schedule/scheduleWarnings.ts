import type {
  Employee,
  ScheduleShiftCode,
  ShiftDisplayConfig,
  ShiftTimeConfig,
} from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";
import { formatShiftName } from "./shiftLabels";
import {
  findCatalogShift,
  isOffShiftCode,
  resolveShiftDisplay,
  resolveShiftTimeRanges,
} from "@/lib/shift-catalog/resolve";
import { timeToMinutes } from "@/lib/attendance/punchSchedule";
import { isFixedSundayRest, isLocalSaturday } from "@/lib/schedule/sundayRest";

const isSunday = (dateStr: string) => isFixedSundayRest(dateStr);
const isSaturday = (dateStr: string) => isLocalSaturday(dateStr);

export type ScheduleWarning = {
  dateStr: string;
  day: number;
  messages: string[];
};

const MIN_SATURDAY_WORKERS = 2;

function isOff(
  shift: ScheduleShiftCode,
  storeConfig?: StoreConfig
): boolean {
  return storeConfig ? isOffShiftCode(shift, storeConfig) : shift === "X";
}

/** 是否含晚班時段（18:00 後仍有上班）或竹山 A／目錄 night／all_day */
export function isEveningOrFullCoverageShift(
  shift: ScheduleShiftCode,
  storeConfig?: StoreConfig,
  shiftTimeConfig?: ShiftTimeConfig
): boolean {
  if (shift === "A" || shift === "D" || shift === "E") return true;
  if (!storeConfig) return false;
  const cat = findCatalogShift(storeConfig, shift);
  if (cat?.category === "night" || cat?.category === "all_day" || cat?.category === "split") {
    return true;
  }
  if (!shiftTimeConfig) return false;
  const ranges = resolveShiftTimeRanges(shift, storeConfig, shiftTimeConfig);
  return ranges.some((r) => {
    if (!r.includes("-") || r === "休假") return false;
    const end = r.split("-")[1]?.trim();
    return Boolean(end && timeToMinutes(end) > 18 * 60);
  });
}

function isMorningishShift(
  shift: ScheduleShiftCode,
  storeConfig: StoreConfig | undefined,
  shiftTimeConfig: ShiftTimeConfig | undefined,
  saturdayDefault: string
): boolean {
  if (shift === saturdayDefault || shift === "C") return true;
  if (!storeConfig || !shiftTimeConfig) return false;
  const ranges = resolveShiftTimeRanges(shift, storeConfig, shiftTimeConfig);
  return ranges.some((r) => {
    if (!r.includes("-") || r === "休假") return false;
    const start = r.split("-")[0]?.trim();
    return Boolean(start && timeToMinutes(start) < 12 * 60);
  });
}

function labelFor(
  shift: ScheduleShiftCode,
  shiftDisplayConfig: ShiftDisplayConfig,
  storeConfig?: StoreConfig
): string {
  if (storeConfig) {
    return resolveShiftDisplay(shift, storeConfig, shiftDisplayConfig).label;
  }
  return formatShiftName(shiftDisplayConfig, shift);
}

export function buildScheduleWarnings(options: {
  year: number;
  month: number;
  daysInMonth: number;
  employees: Employee[];
  shiftDisplayConfig: ShiftDisplayConfig;
  getShiftForDate: (date: string, employeeId: string) => ScheduleShiftCode;
  storeConfig?: StoreConfig;
  shiftTimeConfig?: ShiftTimeConfig;
}): ScheduleWarning[] {
  const {
    year,
    month,
    daysInMonth,
    employees,
    shiftDisplayConfig,
    getShiftForDate,
    storeConfig,
    shiftTimeConfig,
  } = options;
  const staff = employees.filter((emp) => emp.role !== "owner");
  const saturdayTarget = storeConfig?.defaultSaturdayShift || "C";
  const weekdayCoverageTarget = storeConfig?.features.customShiftCatalog
    ? null
    : "A";

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
        const working = workers.filter((w) => !isOff(w.shift, storeConfig));
        const morning = workers.filter((w) =>
          isMorningishShift(w.shift, storeConfig, shiftTimeConfig, saturdayTarget)
        );
        if (morning.length === 0) {
          messages.push(
            `沒有人上上午班（建議 ${labelFor(saturdayTarget, shiftDisplayConfig, storeConfig)}）`
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
        const resting = workers
          .filter((w) => isOff(w.shift, storeConfig))
          .map((w) => w.emp.name);
        if (resting.length > 1) {
          messages.push(`平日多人休假：${resting.join("、")}`);
        }

        if (weekdayCoverageTarget) {
          const fullDayWorkers = workers
            .filter((w) => w.shift === weekdayCoverageTarget)
            .map((w) => w.emp.name);
          if (fullDayWorkers.length === 0) {
            messages.push(
              `沒有人上${labelFor(weekdayCoverageTarget, shiftDisplayConfig, storeConfig)}`
            );
          }
        } else {
          const coverage = workers.filter((w) =>
            isEveningOrFullCoverageShift(w.shift, storeConfig, shiftTimeConfig)
          );
          const anyWorking = workers.some((w) => !isOff(w.shift, storeConfig));
          if (anyWorking && coverage.length === 0) {
            messages.push("平日無人排晚班／整天班（含兩頭班）");
          }
        }
      }

      if (messages.length === 0) return null;
      return { dateStr, day, messages };
    })
    .filter(Boolean) as ScheduleWarning[];
}
