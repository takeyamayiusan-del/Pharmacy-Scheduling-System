/** 請假／加班同天同時段重複申請防呆 */

export function normalizeTime(time: string): string {
  if (!time) return "00:00";
  const parts = time.split(":");
  const h = String(Number(parts[0] ?? 0)).padStart(2, "0");
  const m = String(Number(parts[1] ?? 0)).padStart(2, "0");
  return `${h}:${m}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = normalizeTime(time).split(":").map(Number);
  return h * 60 + m;
}

/** 半開區間 [start, end) 是否重疊；結束等於開始不算重疊 */
export function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const a0 = timeToMinutes(startA);
  const a1 = timeToMinutes(endA);
  const b0 = timeToMinutes(startB);
  const b1 = timeToMinutes(endB);
  if (a1 <= a0 || b1 <= b0) return false;
  return a0 < b1 && b0 < a1;
}

export function datesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && startB <= endA;
}

export type ExistingLeaveSlot = {
  leave_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  period?: string | null;
  status?: string | null;
};

export type ExistingOvertimeSlot = {
  overtime_date: string;
  start_time: string;
  end_time: string;
  status?: string | null;
};

function leaveTimesFromRow(row: ExistingLeaveSlot): { start: string; end: string } {
  if (row.start_time && row.end_time) {
    return {
      start: normalizeTime(row.start_time),
      end: normalizeTime(row.end_time),
    };
  }
  if (row.period === "morning") return { start: "08:30", end: "12:00" };
  if (row.period === "afternoon") return { start: "13:30", end: "18:00" };
  return { start: "08:30", end: "18:00" };
}

/** 同一員工、日期區間重疊且時段重疊（待審核／已核准） */
export function hasDuplicateLeave(
  incoming: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  },
  existing: ExistingLeaveSlot[]
): boolean {
  const inStart = normalizeTime(incoming.startTime);
  const inEnd = normalizeTime(incoming.endTime);
  return existing.some((row) => {
    const rowStart = row.leave_date;
    const rowEnd = row.end_date || row.leave_date;
    if (!datesOverlap(incoming.startDate, incoming.endDate, rowStart, rowEnd)) {
      return false;
    }
    const times = leaveTimesFromRow(row);
    return timesOverlap(inStart, inEnd, times.start, times.end);
  });
}

/** 同一員工、同一天、時段重疊（待審核／已核准） */
export function hasDuplicateOvertime(
  incoming: { date: string; startTime: string; endTime: string },
  existing: ExistingOvertimeSlot[]
): boolean {
  const inStart = normalizeTime(incoming.startTime);
  const inEnd = normalizeTime(incoming.endTime);
  return existing.some((row) => {
    if (row.overtime_date !== incoming.date) return false;
    return timesOverlap(
      inStart,
      inEnd,
      normalizeTime(row.start_time),
      normalizeTime(row.end_time)
    );
  });
}

export const DUPLICATE_LEAVE_MESSAGE =
  "你已重複申請：同天同時段已有請假申請（待審核或已核准），請勿再送出";

export const DUPLICATE_OVERTIME_MESSAGE =
  "你已重複申請：同天同時段已有加班申請（待審核或已核准），請勿再送出";
