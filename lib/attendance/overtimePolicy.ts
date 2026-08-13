import type { StorePolicies } from "@/lib/store-policies";
import {
  calcOvertimeMinutes as calcDurationMinutes,
  type OvertimeCompensationType,
} from "@/lib/attendance/overtimeCompensation";

export function overtimeMinApplyMinutes(policies: StorePolicies): number {
  return Math.max(0, policies.overtimeMinApplyMinutes);
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
  const cap = policies.overtimeForceCompLeaveAfterMinutes;
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
    return `未滿 ${minApply} 分鐘不可申請加班`;
  }
  const cap = policies.overtimeForceCompLeaveAfterMinutes;
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
  const cap = policies.overtimeForceCompLeaveAfterMinutes;
  if (!startTime || !endTime) {
    const force =
      cap == null
        ? "加班費或補休由申請人／店長自選，不強迫轉補休。"
        : `超過 ${cap} 分鐘僅能補休。`;
    return `未滿 ${minApply} 分鐘不可申請加班。${force}`;
  }
  const minutes = calcDurationMinutes(startTime, endTime);
  if (minutes <= 0) return "結束時間必須晚於開始時間";
  if (minutes < minApply) {
    return `本次 ${minutes} 分鐘（未滿 ${minApply}），不可申請加班。`;
  }
  if (cap == null) {
    return `本次 ${minutes} 分鐘，可申請加班；加班費或補休請自行選擇。`;
  }
  if (minutes <= cap) {
    return `本次 ${minutes} 分鐘（≤${cap}），可選擇加班費或補休。`;
  }
  return `本次 ${minutes} 分鐘（>${cap}），僅能申請補休。`;
}
