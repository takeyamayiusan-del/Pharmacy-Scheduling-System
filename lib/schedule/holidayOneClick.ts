export type HolidayShiftCode = "A" | "B" | "C" | "D" | "E" | "X";

export type HolidayOneClickMode = "work" | "off";

export type HolidayOneClickInput = {
  mode: HolidayOneClickMode;
  /** 當日若上班應排的班別（已忽略排休／請假） */
  workShift: HolidayShiftCode;
  /** 員工是否已勾選排休 */
  hasLeaveSelection: boolean;
  /** 是否有全日核准請假 */
  hasApprovedFullDayLeave: boolean;
};

/**
 * 國定假日一鍵設定：決定該員工當日應寫入的班別。
 * - off：全員休假（X）
 * - work：依基準班上班；已排休或全日請假者維持休假（X）
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
}): HolidayOneClickChange[] {
  const changes: HolidayOneClickChange[] = [];

  for (const employeeId of params.employeeIds) {
    const from = params.getCurrentShift(employeeId);
    const to = resolveHolidayOneClickShift({
      mode: params.mode,
      workShift: params.getWorkShift(employeeId),
      hasLeaveSelection: params.hasLeaveSelection(employeeId),
      hasApprovedFullDayLeave: params.hasApprovedFullDayLeave(employeeId),
    });
    if (from === to) continue;
    changes.push({ employeeId, date: params.date, from, to });
  }

  return changes;
}
