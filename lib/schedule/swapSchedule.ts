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

/**
 * 換班前需快照的格子：
 * - 自行換班：同一人兩日
 * - 與他人換班：兩人在「我的日期」與「對方日期」共最多 4 格（同日則 2 格）
 *   才能正確「換出／換入」出勤日並在取消時完整還原
 */
export function swapSnapshotCells(request: SwapRequestCore, isSelfSwap: boolean) {
  if (isSelfSwap) {
    return [
      { userId: request.requesterId, date: request.requesterDate },
      { userId: request.requesterId, date: request.targetDate },
    ];
  }

  const cells = [
    { userId: request.requesterId, date: request.requesterDate },
    { userId: request.requesterId, date: request.targetDate },
    { userId: request.targetEmployeeId, date: request.requesterDate },
    { userId: request.targetEmployeeId, date: request.targetDate },
  ];

  // 同日對換時去重
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = `${cell.userId}:${cell.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeChanges(changes: SwapScheduleChange[]): SwapScheduleChange[] {
  const map = new Map<string, SwapScheduleChange>();
  for (const change of changes) {
    map.set(`${change.userId}:${change.date}`, change);
  }
  return Array.from(map.values());
}

/**
 * 班表互換：
 * - 自行換班：兩日班別對調
 * - 與他人換班：兩人在「換出日／換入日」整段對調（真正互換出勤），不是只改自己那天的班別碼
 */
export function computeSwapScheduleChanges(
  request: SwapRequestCore,
  reqShift: ShiftType,
  targetShift: ShiftType,
  requesterOnTargetDate: ShiftType,
  targetOnRequesterDate: ShiftType
): SwapScheduleChange[] {
  const isSelfSwap = request.requesterId === request.targetEmployeeId;

  if (isSelfSwap) {
    return dedupeChanges([
      { userId: request.requesterId, date: request.requesterDate, shift: targetShift },
      { userId: request.requesterId, date: request.targetDate, shift: reqShift },
    ]);
  }

  // 與他人：A 換出 D1、換入 D2；B 換出 D2、換入 D1
  // → 兩人在 D1/D2 的班表整段對調
  return dedupeChanges([
    { userId: request.requesterId, date: request.requesterDate, shift: targetOnRequesterDate },
    { userId: request.requesterId, date: request.targetDate, shift: targetShift },
    { userId: request.targetEmployeeId, date: request.targetDate, shift: requesterOnTargetDate },
    { userId: request.targetEmployeeId, date: request.requesterDate, shift: reqShift },
  ]);
}

export function buildSwapShiftsAndChanges(
  request: SwapRequestCore,
  snapshot: ScheduleSnapshotEntry[]
): {
  isSelfSwap: boolean;
  reqShift: ShiftType;
  targetShift: ShiftType;
  changes: SwapScheduleChange[];
} {
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

  const requesterOnTargetDate = isSelfSwap
    ? targetShift
    : getShiftFromSnapshot(snapshot, request.requesterId, request.targetDate, "X");
  const targetOnRequesterDate = isSelfSwap
    ? reqShift
    : getShiftFromSnapshot(snapshot, request.targetEmployeeId, request.requesterDate, "X");

  const changes = computeSwapScheduleChanges(
    request,
    reqShift,
    targetShift,
    requesterOnTargetDate,
    targetOnRequesterDate
  );

  if (changes.length < 2) {
    throw new Error("換班班表變更數量錯誤");
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
