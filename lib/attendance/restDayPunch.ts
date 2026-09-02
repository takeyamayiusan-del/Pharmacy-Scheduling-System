import type { PunchRecord } from "@/lib/context/AppContext";

export type RestDaySegment = {
  segmentIndex: number;
  workIn: PunchRecord | null;
  workOut: PunchRecord | null;
};

/** 休假日／無班表／全日請假時的加班打卡紀錄 */
export function isRestDayOvertimePunch(p: Pick<PunchRecord, "shift" | "reason">): boolean {
  return p.shift === "X" || (p.reason?.includes("無班表") ?? false);
}

export function buildRestDaySegments(
  punches: Pick<PunchRecord, "action" | "segmentIndex" | "shift" | "reason" | "time" | "id">[]
): RestDaySegment[] {
  const byIndex = new Map<number, RestDaySegment>();

  for (const punch of punches) {
    if (!isRestDayOvertimePunch(punch)) continue;
    let segment = byIndex.get(punch.segmentIndex);
    if (!segment) {
      segment = { segmentIndex: punch.segmentIndex, workIn: null, workOut: null };
      byIndex.set(punch.segmentIndex, segment);
    }
    if (punch.action === "work_in") {
      segment.workIn = punch as PunchRecord;
    } else if (punch.action === "work_out") {
      segment.workOut = punch as PunchRecord;
    }
  }

  return Array.from(byIndex.values()).sort((a, b) => a.segmentIndex - b.segmentIndex);
}

export function getRestDayPunchState(
  punches: Pick<PunchRecord, "action" | "segmentIndex" | "shift" | "reason" | "time" | "id">[]
) {
  const segments = buildRestDaySegments(punches);
  const openSegment = segments.find((s) => s.workIn && !s.workOut) ?? null;
  const maxIndex = segments.reduce((max, s) => Math.max(max, s.segmentIndex), -1);
  const nextWorkInSegmentIndex = openSegment ? null : maxIndex + 1;

  return {
    segments,
    openSegment,
    nextWorkInSegmentIndex,
    canWorkIn: !openSegment,
    canWorkOut: !!openSegment,
    workOutSegmentIndex: openSegment?.segmentIndex ?? null,
  };
}

export function restDaySegmentLabel(segmentIndex: number): string {
  return segmentIndex === 0 ? "第 1 段" : `第 ${segmentIndex + 1} 段`;
}
