import type { Employee } from "@/lib/context/AppContext";

export type LeaveSelectionsMap = Record<string, string[]>;

import {
  isFixedSundayRest,
  isLocalDateInMonth,
  isLocalSaturday,
  parseLocalDateParts,
} from "@/lib/schedule/sundayRest";

const isSunday = (dateStr: string) => isFixedSundayRest(dateStr);
const isSaturday = (dateStr: string) => isLocalSaturday(dateStr);

export type ManagerLeaveAssignCheck = {
  shouldWarn: boolean;
  message?: string;
};

/** 店長/老闆將某日改為休假 (X) 時，檢查是否違反排休規則 */
export function checkManagerLeaveAssignment(
  employee: Employee | undefined,
  employeeName: string,
  date: string,
  leaveSelections: LeaveSelectionsMap,
  quotas?: { saturdayLimit: number; weekdayLimit: number; monthPool?: boolean }
): ManagerLeaveAssignCheck {
  if (isSunday(date)) {
    return { shouldWarn: false };
  }

  const employeeId = employee?.id;
  if (!employeeId) {
    return { shouldWarn: false };
  }

  const parts = parseLocalDateParts(date);
  if (!parts) {
    return { shouldWarn: false };
  }
  const year = parts.y;
  const month = parts.m;
  const day = parts.d;
  const monthDates = (leaveSelections[employeeId] ?? []).filter((d) =>
    isLocalDateInMonth(d, year, month)
  );

  if (monthDates.includes(date)) {
    return { shouldWarn: false };
  }

  const isWeekdayOffRule = employee?.isWeekdayOffRule ?? false;
  if (isWeekdayOffRule && !isSaturday(date)) {
    return {
      shouldWarn: true,
      message: `${employeeName} 套用「平日不排休」規則。確定要將 ${month}/${day} 排為休假，並同步至排休選擇？`,
    };
  }

  if (employee?.isHalfDayLeaveRule) {
    return {
      shouldWarn: true,
      message: `${employeeName} 套用「只能休半天」。班表改全日休假會算一次排休機會；若要休上午或下午，請改由排休選擇指定。是否仍要將 ${month}/${day} 排為全日休假？`,
    };
  }

  const saturdayUsed = monthDates.filter(isSaturday).length;
  const weekdayUsed = monthDates.filter((d) => !isSaturday(d) && !isSunday(d)).length;
  const saturdayLimit = quotas?.saturdayLimit ?? 2;
  const weekdayLimit = quotas?.weekdayLimit ?? 2;
  const monthPool = quotas?.monthPool === true;

  if (monthPool) {
    const used = monthDates.filter((d) => !isSunday(d)).length;
    if (used >= saturdayLimit) {
      return {
        shouldWarn: true,
        message: `${employeeName} 本月排休已達 ${used}/${saturdayLimit} 天（依本月週六數），再排休將超過規定。是否仍要修改並同步至排休選擇？`,
      };
    }
    return { shouldWarn: false };
  }

  if (isSaturday(date) && saturdayUsed >= saturdayLimit) {
    return {
      shouldWarn: true,
      message: `${employeeName} 本月禮拜六排休已達 ${saturdayUsed}/${saturdayLimit} 天，再排休將超過規定。是否仍要修改並同步至排休選擇？`,
    };
  }

  if (!isSaturday(date) && weekdayUsed >= weekdayLimit) {
    return {
      shouldWarn: true,
      message: `${employeeName} 本月平日排休已達 ${weekdayUsed}/${weekdayLimit} 天，再排休將超過規定。是否仍要修改並同步至排休選擇？`,
    };
  }

  return { shouldWarn: false };
}

/** 是否應同步寫入/刪除 leave_selections（禮拜日固定休，不列入排休選擇） */
export function shouldSyncLeaveSelection(
  date: string,
  shift: string,
  options?: { keepHalfDayLeave?: boolean }
): "add" | "remove" | "none" {
  if (isSunday(date)) return "none";
  if (shift === "X") return "add";
  if (options?.keepHalfDayLeave) return "none";
  return "remove";
}
