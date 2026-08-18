import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleShiftCode } from "@/lib/context/AppContext";
import { normalizeCalendarDate } from "@/lib/schedule/sundayRest";

export type ScheduleSnapshotEntry = {
  userId: string;
  date: string;
  shift: ScheduleShiftCode | null;
  hadDbEntry: boolean;
};

export async function fetchDbScheduleShifts(
  supabase: SupabaseClient,
  userIds: string[],
  dates: string[]
): Promise<Map<string, ScheduleShiftCode>> {
  const map = new Map<string, ScheduleShiftCode>();
  if (userIds.length === 0 || dates.length === 0) return map;

  const { data } = await supabase
    .from("schedule_entries")
    .select("user_id, date, shift_code")
    .in("user_id", userIds)
    .in("date", dates);

  for (const row of data ?? []) {
    const date = normalizeCalendarDate(row.date);
    if (!date) continue;
    map.set(`${row.user_id}:${date}`, String(row.shift_code));
  }
  return map;
}

export async function restoreScheduleSnapshot(
  supabase: SupabaseClient,
  snapshot: ScheduleSnapshotEntry[],
  updatedBy?: string
) {
  for (const entry of snapshot) {
    if (entry.hadDbEntry && entry.shift != null) {
      await supabase.from("schedule_entries").upsert(
        {
          user_id: entry.userId,
          date: entry.date,
          shift_code: entry.shift,
          updated_by: updatedBy,
        },
        { onConflict: "user_id,date" }
      );
    } else {
      await supabase
        .from("schedule_entries")
        .delete()
        .eq("user_id", entry.userId)
        .eq("date", entry.date);
    }
  }
}

export async function upsertScheduleShift(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  shift: ScheduleShiftCode,
  updatedBy?: string
) {
  const { error } = await supabase.from("schedule_entries").upsert(
    {
      user_id: userId,
      date,
      shift_code: shift,
      updated_by: updatedBy,
    },
    { onConflict: "user_id,date" }
  );
  if (error) throw new Error(`班表更新失敗：${error.message}`);
}
