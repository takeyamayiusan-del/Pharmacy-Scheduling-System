import type { StorePolicies } from "@/lib/store-policies";
import {
  calcOvertimeMinutes as calcDurationMinutes,
  type OvertimeCompensationType,
} from "@/lib/attendance/overtimeCompensation";

export function overtimeMinApplyMinutes(policies: StorePolicies): number {
  return Math.max(0, policies.overtimeMinApplyMinutes);
}

/** 超過此分鐘僅能補休；null＝不強迫 */
export function overtimePayChoiceCapMinutes(policies: StorePolicies): number | null {
  return policies.overtimeForceCompLeaveAfterMinutes;
}

/** 加班超過此分鐘自動扣用餐／休息；null＝不扣 */
export function overtimeMealDeductAfterMinutes(policies: StorePolicies): number | null {
  return policies.overtimeMealDeductAfterMinutes;
}

export function overtimeMealDeductMinutes(policies: StorePolicies): number {
  return Math.max(0, policies.overtimeMealDeductMinutes);
}

export type OvertimeCreditedResult = {
  rawMinutes: number;
  creditedMinutes: number;
  deductedMinutes: number;
  creditedHours: number;
  reminder: string | null;
};

/** 依店規計算可計入的加班分鐘（逾門檻自動扣用餐） */
export function resolveOvertimeCreditedMinutes(
  startTime: string,
  endTime: string,
  policies: StorePolicies
): OvertimeCreditedResult {
  const rawMinutes = calcDurationMinutes(startTime, endTime);
  if (rawMinutes <= 0) {
    return {
      rawMinutes: 0,
      creditedMinutes: 0,
      deductedMinutes: 0,
      creditedHours: 0,
      reminder: null,
    };
  }
  const after = overtimeMealDeductAfterMinutes(policies);
  const deduct = overtimeMealDeductMinutes(policies);
  let deductedMinutes = 0;
  if (after != null && deduct > 0 && rawMinutes > after) {
    deductedMinutes = Math.min(deduct, rawMinutes);
  }
  const creditedMinutes = Math.max(0, rawMinutes - deductedMinutes);
  const creditedHours = Math.round((creditedMinutes / 60) * 100) / 100;
  const reminder =
    deductedMinutes > 0
      ? `加班超過 ${after} 分鐘，已自動扣除用餐／休息 ${deductedMinutes} 分鐘（實計 ${creditedMinutes} 分鐘／${creditedHours} 小時）`
      : null;
  return { rawMinutes, creditedMinutes, deductedMinutes, creditedHours, reminder };
}

export function canSubmitOvertimeRequest(
  startTime: string,
  endTime: string,
  policies: StorePolicies
): boolean {
  const minutes = calcDurationMinutes(startTime, endTime);
  return minutes >= overtimeMinApplyMinutes(policies);
}

export function canChooseOvertimePayWithPolicy(
  startTime: string,
  endTime: string,
  policies: StorePolicies
): boolean {
  const minutes = calcDurationMinutes(startTime, endTime);
  if (minutes <= 0) return false;
  const cap = overtimePayChoiceCapMinutes(policies);
  if (cap == null) return true;
  return minutes <= cap;
}

export function resolveCompensationWithPolicy(
  startTime: string,
  endTime: string,
  preferred: OvertimeCompensationType,
  policies: StorePolicies
): OvertimeCompensationType {
  if (preferred === "pay" && !canChooseOvertimePayWithPolicy(startTime, endTime, policies)) {
    return "time_off";
  }
  return preferred;
}

export function validateOvertimeWithPolicy(
  startTime: string,
  endTime: string,
  compensationType: OvertimeCompensationType,
  policies: StorePolicies
): string | null {
  const minutes = calcDurationMinutes(startTime, endTime);
  if (minutes <= 0) return "結束時間必須晚於開始時間";
  const minApply = overtimeMinApplyMinutes(policies);
  if (minutes < minApply) {
    return `未滿 ${minApply} 分鐘不可申請加班（滿半小時才算）`;
  }
  const cap = overtimePayChoiceCapMinutes(policies);
  if (cap != null && compensationType === "pay" && minutes > cap) {
    return `加班超過 ${cap} 分鐘僅能申請補休，不可選加班費`;
  }
  return null;
}

export function overtimePolicyHint(
  startTime: string,
  endTime: string,
  policies: StorePolicies
): string {
  const minApply = overtimeMinApplyMinutes(policies);
  const cap = overtimePayChoiceCapMinutes(policies);
  const mealAfter = overtimeMealDeductAfterMinutes(policies);
  const mealDeduct = overtimeMealDeductMinutes(policies);
  const mealRule =
    mealAfter != null && mealDeduct > 0
      ? `超過 ${mealAfter} 分鐘自動扣 ${mealDeduct} 分鐘用餐／休息。`
      : "";

  if (!startTime || !endTime) {
    const force =
      cap == null
        ? "加班費或補休由申請人／店長自選，不強迫轉補休。"
        : `${cap} 分鐘以內可選加班費或補休；超過僅能補休。`;
    return `未滿 ${minApply} 分鐘不可申請加班。${force}${mealRule}`;
  }

  const credited = resolveOvertimeCreditedMinutes(startTime, endTime, policies);
  if (credited.rawMinutes <= 0) return "結束時間必須晚於開始時間";
  if (credited.rawMinutes < minApply) {
    return `本次 ${credited.rawMinutes} 分鐘（未滿 ${minApply}），不可申請加班。`;
  }

  const parts: string[] = [];
  if (cap == null) {
    parts.push(`本次時段 ${credited.rawMinutes} 分鐘，可申請加班；加班費或補休請自行選擇。`);
  } else if (credited.rawMinutes <= cap) {
    parts.push(`本次時段 ${credited.rawMinutes} 分鐘（≤${cap}），可選擇加班費或補休。`);
  } else {
    parts.push(`本次時段 ${credited.rawMinutes} 分鐘（>${cap}），僅能申請補休。`);
  }
  if (credited.reminder) {
    parts.push(credited.reminder);
  }
  return parts.join(" ");
}

/** 兩店建議統一的加班規則（可於店家設定一鍵套用） */
export const UNIFIED_OVERTIME_POLICY_DEFAULTS = {
  overtimeMinApplyMinutes: 30,
  overtimeForceCompLeaveAfterMinutes: 60,
  overtimeMealDeductAfterMinutes: 240,
  overtimeMealDeductMinutes: 30,
} as const;
