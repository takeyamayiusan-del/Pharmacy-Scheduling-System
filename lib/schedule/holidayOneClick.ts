import type { StoreConfig } from "@/lib/store-config";
import {
  findCatalogShift,
  getScheduleShiftOptions,
  isOffShiftCode,
} from "@/lib/shift-catalog/resolve";

/** 班表碼（竹山 A–E／X；集集可為目錄碼） */
export type HolidayShiftCode = string;

export type HolidayOneClickMode = "work" | "off";

/** 一鍵上班班別：auto = 依每人固定班／基準班；其餘為指定班別碼 */
export type HolidayWorkShiftChoice = "auto" | string;

export const LEGACY_HOLIDAY_WORK_SHIFT_OPTIONS: Array<{
  value: HolidayWorkShiftChoice;
  label: string;
}> = [
  { value: "auto", label: "依固定班" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "E", label: "E" },
];

/** @deprecated 請改用 getHolidayWorkShiftOptions(storeConfig) */
export const HOLIDAY_WORK_SHIFT_OPTIONS = LEGACY_HOLIDAY_WORK_SHIFT_OPTIONS;

/** 依店設定產生一鍵上班選項（集集走目錄；竹山 A–E） */
export function getHolidayWorkShiftOptions(
  storeConfig: StoreConfig
): Array<{ value: HolidayWorkShiftChoice; label: string }> {
  const auto = { value: "auto" as const, label: "依固定班" };
  if (!storeConfig.features.customShiftCatalog) {
    return LEGACY_HOLIDAY_WORK_SHIFT_OPTIONS;
  }
  const codes = getScheduleShiftOptions(storeConfig).filter(
    (code) => code !== "X" && !isOffShiftCode(code, storeConfig)
  );
  return [
    auto,
    ...codes.map((code) => {
      const cat = findCatalogShift(storeConfig, code);
      const short = cat?.shortLabel || code;
      const name = cat?.name || code;
      return {
        value: code,
        label: short === name ? short : `${short}（${name}）`,
      };
    }),
  ];
}

export type HolidayOneClickInput = {
  mode: HolidayOneClickMode;
  /** 當日若上班應排的班別（已忽略排休／請假；若有指定班別則為指定值） */
  workShift: HolidayShiftCode;
  /** 員工是否已勾選排休 */
  hasLeaveSelection: boolean;
  /** 是否有全日核准請假 */
  hasApprovedFullDayLeave: boolean;
  /**
   * 基準班為 X 時的後備上班班（竹山預設 B；集集用 defaultWeekdayShift）
   */
  fallbackWorkShift?: HolidayShiftCode;
};

/**
 * 國定假日一鍵設定：決定該員工當日應寫入的班別。
 * - off：全員休假（X）
 * - work：依基準班或指定班別上班；已排休或全日請假者維持休假（X）
 */
export function resolveHolidayOneClickShift(input: HolidayOneClickInput): HolidayShiftCode {
  if (input.mode === "off") return "X";

  if (input.hasLeaveSelection || input.hasApprovedFullDayLeave) {
    return "X";
  }

  const fallback = input.fallbackWorkShift || "B";
  if (input.workShift === "X") {
    return fallback === "X" ? "B" : fallback;
  }

  return input.workShift;
}

/** 解析一鍵上班要用的班別（指定優先，否則用基準班） */
export function resolveHolidayWorkShift(
  choice: HolidayWorkShiftChoice | undefined,
  baseWorkShift: HolidayShiftCode,
  fallbackWorkShift: HolidayShiftCode = "B"
): HolidayShiftCode {
  if (choice && choice !== "auto") return choice;
  if (baseWorkShift === "X") {
    return fallbackWorkShift === "X" ? "B" : fallbackWorkShift;
  }
  return baseWorkShift;
}

export type HolidayOneClickChange = {
  employeeId: string;
  date: string;
  from: HolidayShiftCode;
  to: HolidayShiftCode;
};

/**
 * 計算一鍵設定後需要寫入的變更（略過 unchanged）。
 */
export function buildHolidayOneClickChanges(params: {
  date: string;
  mode: HolidayOneClickMode;
  employeeIds: string[];
  getCurrentShift: (employeeId: string) => HolidayShiftCode;
  getWorkShift: (employeeId: string) => HolidayShiftCode;
  hasLeaveSelection: (employeeId: string) => boolean;
  hasApprovedFullDayLeave: (employeeId: string) => boolean;
  /** 設為上班時可指定全員同一班別；省略或 auto 則依每人基準班 */
  workShiftChoice?: HolidayWorkShiftChoice;
  /** 基準班為 X 時後備（預設 B） */
  fallbackWorkShift?: HolidayShiftCode;
}): HolidayOneClickChange[] {
  const changes: HolidayOneClickChange[] = [];
  const fallback = params.fallbackWorkShift || "B";

  for (const employeeId of params.employeeIds) {
    const from = params.getCurrentShift(employeeId);
    const workShift = resolveHolidayWorkShift(
      params.workShiftChoice,
      params.getWorkShift(employeeId),
      fallback
    );
    const to = resolveHolidayOneClickShift({
      mode: params.mode,
      workShift,
      hasLeaveSelection: params.hasLeaveSelection(employeeId),
      hasApprovedFullDayLeave: params.hasApprovedFullDayLeave(employeeId),
      fallbackWorkShift: fallback,
    });
    if (from === to) continue;
    changes.push({ employeeId, date: params.date, from, to });
  }

  return changes;
}
