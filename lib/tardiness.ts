import type { OvertimeRequest, PunchRecord, TardinessRecord } from "@/lib/context/AppContext";

export type EffectiveTardinessRecord = TardinessRecord & {
  sourcePunchId?: string;
};

export function buildEffectiveTardinessRecords(
  tardinessRecords: TardinessRecord[],
  punchRecords: PunchRecord[],
  overtimeRequests: OvertimeRequest[]
): EffectiveTardinessRecord[] {
  const shouldCancelTardiness = (employeeId: string, date: string) =>
    overtimeRequests.some(
      (req) =>
        req.employeeId === employeeId &&
        req.date === date &&
        req.status === "approved"
    );

  const records: EffectiveTardinessRecord[] = tardinessRecords.map((record) => ({
    ...record,
  }));

  punchRecords
    .filter(
      (punch) =>
        punch.action === "work_in" &&
        punch.lateMinutes > 0 &&
        !shouldCancelTardiness(punch.employeeId, punch.date)
    )
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
