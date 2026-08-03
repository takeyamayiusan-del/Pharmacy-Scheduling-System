/** 可選「加班費」的最長加班分鐘數（半小時內） */
export const OVERTIME_PAY_MAX_MINUTES = 30;

export type OvertimeCompensationType = "pay" | "time_off";

/** 計算加班分鐘數；結束須晚於開始，否則回傳 0 */
export function calcOvertimeMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return Math.max(0, minutes);
}

export function calcOvertimeHours(startTime: string, endTime: string): number {
  return Math.round((calcOvertimeMinutes(startTime, endTime) / 60) * 100) / 100;
}

/** 半小時以內才可選加班費；超過只能補休 */
export function canChooseOvertimePay(startTime: string, endTime: string): boolean {
  const minutes = calcOvertimeMinutes(startTime, endTime);
  return minutes > 0 && minutes <= OVERTIME_PAY_MAX_MINUTES;
}

export function resolveAllowedCompensationType(
  startTime: string,
  endTime: string,
  preferred: OvertimeCompensationType
): OvertimeCompensationType {
  if (preferred === "pay" && !canChooseOvertimePay(startTime, endTime)) {
    return "time_off";
  }
  return preferred;
}

export function validateOvertimeCompensation(
  startTime: string,
  endTime: string,
  compensationType: OvertimeCompensationType
): string | null {
  const minutes = calcOvertimeMinutes(startTime, endTime);
  if (minutes <= 0) {
    return "結束時間必須晚於開始時間";
  }
  if (compensationType === "pay" && minutes > OVERTIME_PAY_MAX_MINUTES) {
    return `加班超過 ${OVERTIME_PAY_MAX_MINUTES} 分鐘（半小時）僅能申請補休，不可選加班費（例如多上一班、假日／國定假日加班）`;
  }
  return null;
}

export function overtimeCompensationHint(startTime: string, endTime: string): string {
  if (!startTime || !endTime) {
    return `半小時（${OVERTIME_PAY_MAX_MINUTES} 分鐘）以內可選加班費或補休；超過半小時僅能換補休。`;
  }
  const minutes = calcOvertimeMinutes(startTime, endTime);
  if (minutes <= 0) {
    return "結束時間必須晚於開始時間";
  }
  if (minutes <= OVERTIME_PAY_MAX_MINUTES) {
    return `本次 ${minutes} 分鐘（≤${OVERTIME_PAY_MAX_MINUTES}），可選擇加班費或補休。`;
  }
  return `本次 ${minutes} 分鐘（>${OVERTIME_PAY_MAX_MINUTES}），僅能申請補休（多上一班／假日／國定假日加班等）。`;
}
