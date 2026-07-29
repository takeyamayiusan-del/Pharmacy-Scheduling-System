import type { OvertimeRequest, PunchRecord, TardinessRecord } from "@/lib/context/AppContext";
import { resolveLeaveTimesForSchedule, type LeavePeriodMode } from "@/lib/schedule/leaveSchedule";
import { timeToMinutes } from "@/lib/attendance/punchSchedule";

export type EffectiveTardinessRecord = TardinessRecord & {
  sourcePunchId?: string;
};

export type LeaveRequestForTardiness = {
  employeeId: string;
  startDate: string;
  endDate: string;
  status: string;
  period: LeavePeriodMode;
  startTime: string;
  endTime: string;
};

/** 由實際打卡時間與遲到分鐘反推預定上班時刻 */
export function inferScheduledTimeFromPunch(
  punchTime: string,
  lateMinutes: number
): string {
  const scheduled = Math.max(0, timeToMinutes(punchTime) - Math.max(0, lateMinutes));
  const hours = Math.floor(scheduled / 60);
  const minutes = scheduled % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** 核准請假是否覆蓋該日（全日），或覆蓋某上班預定時刻（半天／時段） */
export function isCoveredByApprovedLeave(
  employeeId: string,
  date: string,
  leaveRequests: LeaveRequestForTardiness[],
  scheduledTime?: string
): boolean {
  const leaves = leaveRequests.filter(
    (req) =>
      req.employeeId === employeeId &&
      req.status === "approved" &&
      req.startDate <= date &&
      req.endDate >= date
  );

  for (const leave of leaves) {
    if (leave.period === "full_day") return true;
    if (!scheduledTime) continue;

    const { startTime, endTime } = resolveLeaveTimesForSchedule(leave);
    const punch = timeToMinutes(scheduledTime);
    const leaveStart = timeToMinutes(startTime);
    const leaveEnd = timeToMinutes(endTime);
    // 上班預定時刻落在請假時段內 → 不應記遲到
    if (punch >= leaveStart && punch < leaveEnd) return true;
  }

  return false;
}

export function buildEffectiveTardinessRecords(
  tardinessRecords: TardinessRecord[],
  punchRecords: PunchRecord[],
  overtimeRequests: OvertimeRequest[],
  leaveRequests: LeaveRequestForTardiness[] = []
): EffectiveTardinessRecord[] {
  const shouldCancelTardiness = (
    employeeId: string,
    date: string,
    scheduledTime?: string
  ) => {
    const hasApprovedOvertime = overtimeRequests.some(
      (req) =>
        req.employeeId === employeeId &&
        req.date === date &&
        req.status === "approved"
    );
    if (hasApprovedOvertime) return true;
    return isCoveredByApprovedLeave(employeeId, date, leaveRequests, scheduledTime);
  };

  const records: EffectiveTardinessRecord[] = tardinessRecords
    .filter((record) => {
      // 管理頁手動遲到：若當日有全日核准請假，或能從同日打卡反推上班時刻並被請假覆蓋，則不計
      if (shouldCancelTardiness(record.employeeId, record.date)) return false;
      const relatedPunch = punchRecords.find(
        (punch) =>
          punch.employeeId === record.employeeId &&
          punch.date === record.date &&
          punch.action === "work_in" &&
          punch.lateMinutes > 0
      );
      if (!relatedPunch) return true;
      const scheduledTime = inferScheduledTimeFromPunch(
        relatedPunch.time,
        relatedPunch.lateMinutes
      );
      return !shouldCancelTardiness(record.employeeId, record.date, scheduledTime);
    })
    .map((record) => ({
      ...record,
    }));

  punchRecords
    .filter((punch) => {
      if (punch.action !== "work_in" || punch.lateMinutes <= 0) return false;
      const scheduledTime = inferScheduledTimeFromPunch(punch.time, punch.lateMinutes);
      return !shouldCancelTardiness(punch.employeeId, punch.date, scheduledTime);
    })
    .forEach((punch) => {
      const alreadyExists = records.some(
        (record) =>
          record.employeeId === punch.employeeId && record.date === punch.date
      );
      if (!alreadyExists) {
        records.push({
          id: `punch:${punch.id}`,
          sourcePunchId: punch.id,
          employeeId: punch.employeeId,
          employeeName: punch.employeeName,
          date: punch.date,
          minutes: punch.lateMinutes,
          notes: punch.reason ?? "由打卡管理自動同步",
          createdAt: punch.createdAt,
        });
      }
    });

  return records.sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime() ||
      b.createdAt.localeCompare(a.createdAt)
  );
}
