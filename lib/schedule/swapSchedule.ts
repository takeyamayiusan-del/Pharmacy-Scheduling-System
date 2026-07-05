import type { ShiftType, SwapRequest } from "@/lib/context/AppContext";
import type { ScheduleSnapshotEntry } from "@/lib/schedule/scheduleSnapshot";

export type SwapScheduleChange = {
  userId: string;
  date: string;
  shift: ShiftType;
};

export type SwapRequestCore = Pick<
  SwapRequest,
  "requesterId" | "targetEmployeeId" | "requesterDate" | "targetDate"
>;

/** 換班前需快照的格子（僅兩個互換日） */
export function swapSnapshotCells(request: SwapRequestCore, isSelfSwap: boolean) {
  return isSelfSwap
    ? [
        { userId: request.requesterId, date: request.requesterDate },
        { userId: request.requesterId, date: request.targetDate },
      ]
    : [
        { userId: request.requesterId, date: request.requesterDate },
        { userId: request.targetEmployeeId, date: request.targetDate },
      ];
}

/**
 * 班別對換：各自在「自己的換班日」互換當天班別，不標記休班、不寫入其他日期。
 * - 申請者 @ 申請日 → 對方在對方日的班別
 * - 對方 @ 對方日 → 申請者在申請日的班別
 */
export function computeSwapScheduleChanges(
  request: SwapRequestCore,
  reqShift: ShiftType,
  targetShift: ShiftType
): SwapScheduleChange[] {
  const isSelfSwap = request.requesterId === request.targetEmployeeId;

  if (isSelfSwap) {
    return [
      { userId: request.requesterId, date: request.requesterDate, shift: targetShift },
      { userId: request.requesterId, date: request.targetDate, shift: reqShift },
    ];
  }

  return [
    { userId: request.requesterId, date: request.requesterDate, shift: targetShift },
    { userId: request.targetEmployeeId, date: request.targetDate, shift: reqShift },
  ];
}

export function buildSwapShiftsAndChanges(
  request: SwapRequestCore,
  snapshot: ScheduleSnapshotEntry[]
): { isSelfSwap: boolean; reqShift: ShiftType; targetShift: ShiftType; changes: SwapScheduleChange[] } {
  const isSelfSwap = request.requesterId === request.targetEmployeeId;
  const requiredCells = swapSnapshotCells(request, isSelfSwap);

  for (const cell of requiredCells) {
    const found = snapshot.find((s) => s.userId === cell.userId && s.date === cell.date);
    if (!found || found.shift == null) {
      throw new Error(`換班快照缺少 ${cell.userId} @ ${cell.date} 的班別`);
    }
  }

  const reqShift = getShiftFromSnapshot(
    snapshot,
    request.requesterId,
    request.requesterDate,
    "B"
  );
  const targetShift = isSelfSwap
    ? getShiftFromSnapshot(snapshot, request.requesterId, request.targetDate, "B")
    : getShiftFromSnapshot(snapshot, request.targetEmployeeId, request.targetDate, "B");

  const changes = computeSwapScheduleChanges(request, reqShift, targetShift);
  if (changes.length !== 2) {
    throw new Error("換班班表變更數量錯誤（預期 2 格）");
  }

  return { isSelfSwap, reqShift, targetShift, changes };
}

export function getShiftFromSnapshot(
  snapshot: ScheduleSnapshotEntry[],
  userId: string,
  date: string,
  fallback: ShiftType
): ShiftType {
  const item = snapshot.find((s) => s.userId === userId && s.date === date);
  return (item?.shift ?? fallback) as ShiftType;
}
