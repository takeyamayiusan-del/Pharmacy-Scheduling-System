/** 班表碼（竹山 A–E／X；集集可為目錄碼）。一鍵指定仍以 A–E 為主。 */
export type HolidayShiftCode = string;

export type HolidayOneClickMode = "work" | "off";

/** 一鍵上班班別：auto = 依每人固定班／基準班；其餘為指定班別 */
export type HolidayWorkShiftChoice = "auto" | "A" | "B" | "C" | "D" | "E";

export const HOLIDAY_WORK_SHIFT_OPTIONS: Array<{
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

export type HolidayOneClickInput = {
  mode: HolidayOneClickMode;
  /** 當日若上班應排的班別（已忽略排休／請假；若有指定班別則為指定值） */
  workShift: HolidayShiftCode;
  /** 員工是否已勾選排休 */
  hasLeaveSelection: boolean;
  /** 是否有全日核准請假 */
  hasApprovedFullDayLeave: boolean;
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

  if (input.workShift === "X") {
    return "B";
  }

  return input.workShift;
}

/** 解析一鍵上班要用的班別（指定優先，否則用基準班） */
export function resolveHolidayWorkShift(
  choice: HolidayWorkShiftChoice | undefined,
  baseWorkShift: HolidayShiftCode
): HolidayShiftCode {
  if (choice && choice !== "auto") return choice;
  return baseWorkShift === "X" ? "B" : baseWorkShift;
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
}): HolidayOneClickChange[] {
  const changes: HolidayOneClickChange[] = [];

  for (const employeeId of params.employeeIds) {
    const from = params.getCurrentShift(employeeId);
    const workShift = resolveHolidayWorkShift(
      params.workShiftChoice,
      params.getWorkShift(employeeId)
    );
    const to = resolveHolidayOneClickShift({
      mode: params.mode,
      workShift,
      hasLeaveSelection: params.hasLeaveSelection(employeeId),
      hasApprovedFullDayLeave: params.hasApprovedFullDayLeave(employeeId),
    });
    if (from === to) continue;
    changes.push({ employeeId, date: params.date, from, to });
  }

  return changes;
}
