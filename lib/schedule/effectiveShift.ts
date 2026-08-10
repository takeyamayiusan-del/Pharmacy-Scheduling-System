import type { ScheduleShiftCode, ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";
import {
  getScheduleShiftOptions,
  isLegacyShiftCode,
  isOffShiftCode,
  resolveShiftTimeRanges,
} from "@/lib/shift-catalog/resolve";

const shiftTimeSlots: Record<ShiftType, { start: string; end: string }[]> = {
  A: [
    { start: "08:30", end: "12:00" },
    { start: "13:30", end: "17:00" },
    { start: "19:00", end: "21:00" },
  ],
  B: [
    { start: "08:30", end: "12:00" },
    { start: "13:30", end: "18:00" },
  ],
  C: [{ start: "08:30", end: "12:00" }],
  D: [{ start: "13:30", end: "18:00" }],
  E: [
    { start: "13:30", end: "17:00" },
    { start: "19:00", end: "21:00" },
  ],
  X: [],
};

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function rangesToSlots(ranges: string[]): { start: string; end: string }[] {
  return ranges
    .filter((r) => r !== "休假" && r.includes("-"))
    .map((r) => {
      const [start, end] = r.split("-").map((s) => s.trim());
      return { start, end };
    });
}

/** 請假後剩餘班別（null = 全日請假）；目錄碼依時段解析 */
export function calculateEffectiveShift(
  originalShift: ScheduleShiftCode,
  leaveStartTime: string,
  leaveEndTime: string,
  storeConfig?: StoreConfig,
  shiftTimeConfig?: ShiftTimeConfig
): { shift: ScheduleShiftCode | null; details: string; isPartial: boolean } {
  let slots: { start: string; end: string }[] | undefined;
  if (storeConfig && shiftTimeConfig) {
    if (isOffShiftCode(originalShift, storeConfig)) {
      return { shift: null, details: "休假", isPartial: false };
    }
    slots = rangesToSlots(
      resolveShiftTimeRanges(originalShift, storeConfig, shiftTimeConfig)
    );
  } else if (isLegacyShiftCode(originalShift)) {
    slots = shiftTimeSlots[originalShift];
  }

  if (!slots || slots.length === 0) {
    return { shift: null, details: "休假", isPartial: false };
  }

  const leaveStart = timeToMinutes(leaveStartTime);
  const leaveEnd = timeToMinutes(leaveEndTime);
  const remainingSlots: { start: string; end: string }[] = [];

  for (const slot of slots) {
    const slotStart = timeToMinutes(slot.start);
    const slotEnd = timeToMinutes(slot.end);

    if (leaveStart <= slotStart && leaveEnd >= slotEnd) continue;
    if (leaveEnd <= slotStart || leaveStart >= slotEnd) {
      remainingSlots.push({ start: slot.start, end: slot.end });
      continue;
    }
    if (leaveStart > slotStart && leaveStart < slotEnd) {
      remainingSlots.push({ start: slot.start, end: minutesToTime(leaveStart) });
    }
    if (leaveEnd > slotStart && leaveEnd < slotEnd) {
      remainingSlots.push({ start: minutesToTime(leaveEnd), end: slot.end });
    }
  }

  if (remainingSlots.length === 0) {
    return { shift: null, details: "全日請假", isPartial: false };
  }

  const details = remainingSlots.map((s) => `${s.start}-${s.end}`).join(", ");

  const checkMatch = (shiftSlots: { start: string; end: string }[]): boolean => {
    if (shiftSlots.length !== remainingSlots.length) return false;
    for (let i = 0; i < shiftSlots.length; i++) {
      if (
        shiftSlots[i].start !== remainingSlots[i].start ||
        shiftSlots[i].end !== remainingSlots[i].end
      ) {
        return false;
      }
    }
    return true;
  };

  if (storeConfig?.features.customShiftCatalog && shiftTimeConfig) {
    for (const code of getScheduleShiftOptions(storeConfig)) {
      if (isOffShiftCode(code, storeConfig)) continue;
      const candidate = rangesToSlots(
        resolveShiftTimeRanges(code, storeConfig, shiftTimeConfig)
      );
      if (checkMatch(candidate)) {
        return { shift: code, details, isPartial: true };
      }
    }
  } else {
    for (const [shift, shiftSlots] of Object.entries(shiftTimeSlots)) {
      if (checkMatch(shiftSlots)) {
        return { shift: shift as ShiftType, details, isPartial: true };
      }
    }
  }

  return { shift: originalShift, details, isPartial: true };
}

export function enumerateDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
