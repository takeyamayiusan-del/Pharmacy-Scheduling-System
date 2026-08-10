import type { ScheduleShiftCode, ShiftTimeConfig } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";
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

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type LeaveWindow = { start: number; end: number };

function approvedLeaveWindows(
  employeeId: string,
  date: string,
  leaveRequests: LeaveForPunchAdjust[]
): { fullDay: boolean; windows: LeaveWindow[] } {
  const approved = leaveRequests.filter(
    (r) =>
      r.employeeId === employeeId &&
      r.status === "approved" &&
      r.startDate <= date &&
      r.endDate >= date
  );
  if (approved.some((r) => r.period === "full_day")) {
    return { fullDay: true, windows: [] };
  }
  const windows = approved.map((r) => {
    const { startTime, endTime } = resolveLeaveTimesForSchedule(r);
    return { start: timeToMinutes(startTime), end: timeToMinutes(endTime) };
  });
  return { fullDay: false, windows };
}

/**
 * 依已核准請假調整打卡格：
 * - 整段被請假蓋住 → 隱藏
 * - 請假蓋住上班開頭（如 08:30–10:00）→ 上班改為請假結束時刻（10:00），保留下班
 * - 請假蓋住下班前（如 10:00–12:00）→ 下班改為請假開始時刻，保留上班
 */
export function adjustPunchSlotsForApprovedLeave(
  slots: PunchSlot[],
  employeeId: string,
  date: string,
  leaveRequests: LeaveForPunchAdjust[]
): PunchSlot[] {
  const { fullDay, windows } = approvedLeaveWindows(employeeId, date, leaveRequests);
  if (fullDay) return [];
  if (windows.length === 0) return slots;

  const bySegment = new Map<number, { work_in?: PunchSlot; work_out?: PunchSlot }>();
  for (const slot of slots) {
    const row = bySegment.get(slot.segmentIndex) ?? {};
    if (slot.action === "work_in") row.work_in = { ...slot };
    if (slot.action === "work_out") row.work_out = { ...slot };
    bySegment.set(slot.segmentIndex, row);
  }

  const result: PunchSlot[] = [];
  const segmentIndexes = Array.from(bySegment.keys()).sort((a, b) => a - b);

  for (const index of segmentIndexes) {
    const row = bySegment.get(index)!;
    if (!row.work_in || !row.work_out) {
      if (row.work_in) result.push(row.work_in);
      if (row.work_out) result.push(row.work_out);
      continue;
    }

    let inMin = timeToMinutes(row.work_in.scheduledTime);
    let outMin = timeToMinutes(row.work_out.scheduledTime);
    let drop = false;

    for (const leave of windows) {
      // 整段被蓋住
      if (leave.start <= inMin && leave.end >= outMin) {
        drop = true;
        break;
      }
      // 蓋住開頭：上班延後到請假結束
      if (leave.start <= inMin && leave.end > inMin && leave.end < outMin) {
        inMin = leave.end;
        continue;
      }
      // 蓋住結尾：下班提前到請假開始
      if (leave.start > inMin && leave.start < outMin && leave.end >= outMin) {
        outMin = leave.start;
        continue;
      }
      // 蓋住中段：保留請假前一段（下班提前）；後半段另開一段較複雜，此處先保留請假前
      if (leave.start > inMin && leave.end < outMin) {
        outMin = leave.start;
      }
    }

    if (drop || inMin >= outMin) continue;

    result.push({
      ...row.work_in,
      scheduledTime: minutesToTime(inMin),
      label:
        minutesToTime(inMin) !== row.work_in.scheduledTime
          ? `${row.work_in.label}（請假後 ${minutesToTime(inMin)} 起）`
          : row.work_in.label,
    });
    result.push({
      ...row.work_out,
      scheduledTime: minutesToTime(outMin),
      label:
        minutesToTime(outMin) !== row.work_out.scheduledTime
          ? `${row.work_out.label}（請假至 ${minutesToTime(outMin)}）`
          : row.work_out.label,
    });
  }

  return result;
}

/** @deprecated 使用 adjustPunchSlotsForApprovedLeave */
export function filterPunchSlotsForApprovedLeave(
  slots: PunchSlot[],
  employeeId: string,
  date: string,
  leaveRequests: LeaveForPunchAdjust[]
): PunchSlot[] {
  return adjustPunchSlotsForApprovedLeave(slots, employeeId, date, leaveRequests);
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
 * - 否則依請假後調整的上班時刻重算；若不遲到則清除
 */
export function resolveLateAfterLeaveApproval(params: {
  period: LeavePeriodMode;
  leaveStartTime: string;
  leaveEndTime: string;
  punchShift: ScheduleShiftCode;
  segmentIndex: number;
  punchTime: string;
  /** 請假前原班別（用於計算剩餘班） */
  originalShift: ScheduleShiftCode;
  shiftTimeConfig: ShiftTimeConfig;
  storeConfig?: StoreConfig;
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

  const originalSlots = getPunchSlotsForShift(
    params.punchShift,
    params.shiftTimeConfig,
    params.storeConfig
  );
  const adjusted = adjustPunchSlotsForApprovedLeave(
    originalSlots,
    "emp",
    "2099-01-01",
    [
      {
        employeeId: "emp",
        startDate: "2099-01-01",
        endDate: "2099-01-01",
        status: "approved",
        period: params.period,
        startTime,
        endTime,
      },
    ]
  );

  const punchedInSlot = originalSlots.find(
    (s) => s.action === "work_in" && s.segmentIndex === params.segmentIndex
  );
  if (punchedInSlot) {
    const scheduled = timeToMinutes(punchedInSlot.scheduledTime);
    // 原上班時刻完全落在請假內 → 這格本不該打，清除遲到
    if (scheduled >= leaveStart && scheduled < leaveEnd) {
      // 改以調整後同段上班時刻重算（例如 08:30 假到 10:00，打卡 10:05 → 對 10:00）
      const adjustedIn = adjusted.find(
        (s) => s.action === "work_in" && s.segmentIndex === params.segmentIndex
      );
      if (!adjustedIn) {
        return { clear: true, lateMinutes: 0 };
      }
      const lateMinutes = calcLateMinutes(
        timeToMinutes(params.punchTime),
        timeToMinutes(adjustedIn.scheduledTime)
      );
      if (lateMinutes <= 0) return { clear: true, lateMinutes: 0 };
      return { clear: false, lateMinutes };
    }
  }

  const { shift: effective } = calculateEffectiveShift(
    params.originalShift === "X" ? params.punchShift : params.originalShift,
    startTime,
    endTime,
    params.storeConfig,
    params.shiftTimeConfig
  );

  // 優先用調整後的上班格
  const remainingIns = adjusted.filter((s) => s.action === "work_in");
  const fallbackIns =
    remainingIns.length > 0
      ? remainingIns
      : effective && effective !== "X"
        ? getPunchSlotsForShift(
            effective,
            params.shiftTimeConfig,
            params.storeConfig
          ).filter((s) => s.action === "work_in")
        : [];

  if (fallbackIns.length === 0) {
    return { clear: true, lateMinutes: 0 };
  }

  const actual = timeToMinutes(params.punchTime);
  let best = fallbackIns[0];
  for (const s of fallbackIns) {
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
