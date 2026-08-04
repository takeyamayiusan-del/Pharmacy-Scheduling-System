import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";
import {
  calcLateMinutes,
  EARLY_PUNCH_MINUTES,
  getPunchSlotsForShift,
  timeToMinutes,
  type PunchSlot,
} from "@/lib/attendance/punchSchedule";
import { calculateEffectiveShift } from "@/lib/schedule/effectiveShift";
import {
  resolveLeaveTimesForSchedule,
  type LeavePeriodMode,
} from "@/lib/schedule/leaveSchedule";
import { isCoveredByApprovedLeave, type LeaveRequestForTardiness } from "@/lib/tardiness";

export type LeaveForPunchAdjust = LeaveRequestForTardiness & {
  period: LeavePeriodMode;
};

/** 依已核准請假過濾打卡格：請假時段內的上下班格不顯示、不要求打卡 */
export function filterPunchSlotsForApprovedLeave(
  slots: PunchSlot[],
  employeeId: string,
  date: string,
  leaveRequests: LeaveForPunchAdjust[]
): PunchSlot[] {
  const approved = leaveRequests.filter(
    (r) =>
      r.employeeId === employeeId &&
      r.status === "approved" &&
      r.startDate <= date &&
      r.endDate >= date
  );
  if (approved.length === 0) return slots;

  if (approved.some((r) => r.period === "full_day")) return [];

  return slots.filter((slot) => {
    // 上班格：預定時刻落在請假時段 → 隱藏
    if (slot.action === "work_in") {
      return !isCoveredByApprovedLeave(employeeId, date, approved, slot.scheduledTime);
    }
    // 下班格：結束時刻落在請假時段內 → 隱藏
    if (slot.action === "work_out") {
      return !isCoveredByApprovedLeave(employeeId, date, approved, slot.scheduledTime);
    }
    return true;
  });
}

/**
 * 打卡時計算遲到分鐘：若該預定上班已被核准請假覆蓋，則不計遲到。
 */
export function resolvePunchLateMinutes(params: {
  employeeId: string;
  date: string;
  scheduledTime: string;
  actualMinutes: number;
  leaveRequests: LeaveForPunchAdjust[];
}): number {
  if (
    isCoveredByApprovedLeave(
      params.employeeId,
      params.date,
      params.leaveRequests,
      params.scheduledTime
    )
  ) {
    return 0;
  }
  return calcLateMinutes(params.actualMinutes, timeToMinutes(params.scheduledTime));
}

export type LateAfterLeaveDecision = {
  /** 是否應清除遲到 */
  clear: boolean;
  /** 若不清除，依剩餘班別重算後的遲到分鐘 */
  lateMinutes: number;
};

/**
 * 請假核准後，決定既有上班打卡遲到要清除或重算。
 * - 全日／原預定上班落在請假時段 → 清除
 * - 否則依請假後剩餘班別重算；若不遲到則清除
 */
export function resolveLateAfterLeaveApproval(params: {
  period: LeavePeriodMode;
  leaveStartTime: string;
  leaveEndTime: string;
  punchShift: ShiftType;
  segmentIndex: number;
  punchTime: string;
  /** 請假前原班別（用於計算剩餘班） */
  originalShift: ShiftType;
  shiftTimeConfig: ShiftTimeConfig;
}): LateAfterLeaveDecision {
  if (params.period === "full_day") {
    return { clear: true, lateMinutes: 0 };
  }

  const { startTime, endTime } = resolveLeaveTimesForSchedule({
    period: params.period,
    startTime: params.leaveStartTime,
    endTime: params.leaveEndTime,
  });
  const leaveStart = timeToMinutes(startTime);
  const leaveEnd = timeToMinutes(endTime);

  const originalSlots = getPunchSlotsForShift(params.punchShift, params.shiftTimeConfig);
  const punchedInSlot = originalSlots.find(
    (s) => s.action === "work_in" && s.segmentIndex === params.segmentIndex
  );
  if (punchedInSlot) {
    const scheduled = timeToMinutes(punchedInSlot.scheduledTime);
    if (scheduled >= leaveStart && scheduled <= leaveEnd) {
      return { clear: true, lateMinutes: 0 };
    }
  }

  const { shift: effective } = calculateEffectiveShift(
    params.originalShift === "X" ? params.punchShift : params.originalShift,
    startTime,
    endTime
  );
  if (!effective || effective === "X") {
    return { clear: true, lateMinutes: 0 };
  }

  const remainingIns = getPunchSlotsForShift(effective, params.shiftTimeConfig).filter(
    (s) => s.action === "work_in"
  );
  if (remainingIns.length === 0) {
    return { clear: true, lateMinutes: 0 };
  }

  const actual = timeToMinutes(params.punchTime);
  // 對應最接近且不晚於打卡時間（允許提早窗口）的剩餘上班格
  let best = remainingIns[0];
  for (const s of remainingIns) {
    if (timeToMinutes(s.scheduledTime) <= actual + EARLY_PUNCH_MINUTES) {
      best = s;
    }
  }
  const lateMinutes = calcLateMinutes(actual, timeToMinutes(best.scheduledTime));
  if (lateMinutes <= 0) {
    return { clear: true, lateMinutes: 0 };
  }
  return { clear: false, lateMinutes };
}
