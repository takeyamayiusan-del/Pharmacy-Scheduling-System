import type { ScheduleData } from "@/lib/context/AppContext";
import type { ScheduleSnapshotEntry } from "@/lib/schedule/scheduleSnapshot";
import type { SwapScheduleChange } from "@/lib/schedule/swapSchedule";

export function applyScheduleChangesToState(
  prev: ScheduleData,
  changes: SwapScheduleChange[]
): ScheduleData {
  const next: ScheduleData = { ...prev };
  for (const change of changes) {
    const day = { ...(next[change.date] ?? {}) };
    day[change.userId] = change.shift;
    next[change.date] = day;
  }
  return next;
}

export function revertSnapshotOnState(
  prev: ScheduleData,
  snapshot: ScheduleSnapshotEntry[]
): ScheduleData {
  const next: ScheduleData = { ...prev };
  for (const entry of snapshot) {
    const day = { ...(next[entry.date] ?? {}) };
    if (entry.hadDbEntry && entry.shift) {
      day[entry.userId] = entry.shift;
      next[entry.date] = day;
    } else {
      delete day[entry.userId];
      if (Object.keys(day).length === 0) {
        delete next[entry.date];
      } else {
        next[entry.date] = day;
      }
    }
  }
  return next;
}
