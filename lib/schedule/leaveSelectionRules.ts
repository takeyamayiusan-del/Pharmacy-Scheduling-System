import type { Employee } from "@/lib/context/AppContext";

export type LeaveSelectionsMap = Record<string, string[]>;

import { isFixedSundayRest } from "@/lib/schedule/sundayRest";

const isSunday = (dateStr: string) => isFixedSundayRest(dateStr);
const isSaturday = (dateStr: string) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!parts) return false;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])).getDay() === 6;
};

const isInMonth = (dateStr: string, year: number, month: number) => {
  const date = new Date(dateStr);
  return date.getFullYear() === year && date.getMonth() + 1 === month;
};

export type ManagerLeaveAssignCheck = {
  shouldWarn: boolean;
  message?: string;
};

/** 店長/老闆將某日改為休假 (X) 時，檢查是否違反排休規則 */
export function checkManagerLeaveAssignment(
  employee: Employee | undefined,
  employeeName: string,
  date: string,
  leaveSelections: LeaveSelectionsMap
): ManagerLeaveAssignCheck {
  if (isSunday(date)) {
    return { shouldWarn: false };
  }

  const employeeId = employee?.id;
  if (!employeeId) {
    return { shouldWarn: false };
  }

  const year = new Date(date).getFullYear();
  const month = new Date(date).getMonth() + 1;
  const day = new Date(date).getDate();
  const monthDates = (leaveSelections[employeeId] ?? []).filter((d) =>
    isInMonth(d, year, month)
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

  const saturdayUsed = monthDates.filter(isSaturday).length;
  const weekdayUsed = monthDates.filter((d) => !isSaturday(d) && !isSunday(d)).length;

  if (isSaturday(date) && saturdayUsed >= 2) {
    return {
      shouldWarn: true,
      message: `${employeeName} 本月禮拜六排休已達 ${saturdayUsed}/2 天，再排休將超過規定。是否仍要修改並同步至排休選擇？`,
    };
  }

  if (!isSaturday(date) && weekdayUsed >= 2) {
    return {
      shouldWarn: true,
      message: `${employeeName} 本月平日排休已達 ${weekdayUsed}/2 天，再排休將超過規定。是否仍要修改並同步至排休選擇？`,
    };
  }

  return { shouldWarn: false };
}

/** 是否應同步寫入/刪除 leave_selections（禮拜日固定休，不列入排休選擇） */
export function shouldSyncLeaveSelection(date: string, shift: string): "add" | "remove" | "none" {
  if (isSunday(date)) return "none";
  if (shift === "X") return "add";
  return "remove";
}
