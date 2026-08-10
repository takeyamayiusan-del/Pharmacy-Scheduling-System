/**
 * 班別顯示／時段解析：竹山走 A–E 共用設定；集集走店家班別目錄。
 */

import type { CatalogShift, ShiftCategory } from "@/lib/shift-catalog/types";
import type { StoreConfig } from "@/lib/store-config";

export type ShiftDisplayStyle = {
  label: string;
  displayText: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
};

export type LegacyShiftCode = "A" | "B" | "C" | "D" | "E" | "X";

export const LEGACY_SHIFT_CODES: LegacyShiftCode[] = ["A", "B", "C", "D", "E", "X"];

export function isLegacyShiftCode(v: string): v is LegacyShiftCode {
  return (LEGACY_SHIFT_CODES as readonly string[]).includes(v);
}

const CATEGORY_STYLE: Record<ShiftCategory, Omit<ShiftDisplayStyle, "label" | "displayText">> = {
  day: { bgColor: "#dbeafe", textColor: "#1e40af", borderColor: "#60a5fa" },
  mid: { bgColor: "#ffedd5", textColor: "#9a3412", borderColor: "#fb923c" },
  night: { bgColor: "#e0e7ff", textColor: "#3730a3", borderColor: "#818cf8" },
  split: { bgColor: "#fce7f3", textColor: "#9d174d", borderColor: "#f472b6" },
  all_day: { bgColor: "#d1fae5", textColor: "#065f46", borderColor: "#34d399" },
  off: { bgColor: "#e2e8f0", textColor: "#334155", borderColor: "#94a3b8" },
  other: { bgColor: "#f3f4f6", textColor: "#374151", borderColor: "#9ca3af" },
};

const FALLBACK_STYLE: ShiftDisplayStyle = {
  label: "班別",
  displayText: "?",
  bgColor: "#f3f4f6",
  textColor: "#374151",
  borderColor: "#9ca3af",
};

export function findCatalogShift(
  storeConfig: StoreConfig,
  code: string
): CatalogShift | undefined {
  return storeConfig.shiftCatalog.find((s) => s.code === code);
}

/** 班表選單用：啟用中的目錄碼，並保證有休假 X */
export function getScheduleShiftOptions(storeConfig: StoreConfig): string[] {
  if (!storeConfig.features.customShiftCatalog) {
    return storeConfig.shifts.filter((s) => s.enabled).map((s) => s.code);
  }
  const codes = storeConfig.shiftCatalog
    .filter((s) => s.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.code);
  if (!codes.includes("X")) {
    const off = storeConfig.shiftCatalog.find((s) => s.category === "off" && s.enabled);
    if (off && !codes.includes(off.code)) codes.push(off.code);
    else codes.push("X");
  }
  return codes;
}

export function resolveShiftTimeRanges(
  shift: string,
  storeConfig: StoreConfig,
  legacyTimeConfig: Record<string, string[]>
): string[] {
  if (shift === "X") return ["休假"];

  if (storeConfig.features.customShiftCatalog) {
    const cat = findCatalogShift(storeConfig, shift);
    if (cat) {
      if (cat.category === "off" || cat.workSegments.length === 0) return ["休假"];
      return cat.workSegments.map((seg) => `${seg.start}-${seg.end}`);
    }
  }

  if (isLegacyShiftCode(shift)) {
    return legacyTimeConfig[shift] ?? [];
  }
  return [];
}

export function resolveShiftDisplay(
  shift: string,
  storeConfig: StoreConfig,
  legacyDisplayConfig: Record<string, ShiftDisplayStyle>
): ShiftDisplayStyle {
  if (isLegacyShiftCode(shift) && legacyDisplayConfig[shift]) {
    // 集集若同碼在目錄也有，優先目錄名稱
    if (storeConfig.features.customShiftCatalog) {
      const cat = findCatalogShift(storeConfig, shift);
      if (cat) {
        const style = CATEGORY_STYLE[cat.category];
        return {
          label: cat.name,
          displayText: cat.code.slice(0, 4),
          ...style,
        };
      }
    }
    return legacyDisplayConfig[shift];
  }

  if (storeConfig.features.customShiftCatalog) {
    const cat = findCatalogShift(storeConfig, shift);
    if (cat) {
      const style = CATEGORY_STYLE[cat.category];
      return {
        label: cat.name,
        displayText: cat.code.slice(0, 4),
        ...style,
      };
    }
  }

  if (shift === "X") {
    return legacyDisplayConfig.X ?? { ...FALLBACK_STYLE, label: "休假", displayText: "X" };
  }

  return {
    ...FALLBACK_STYLE,
    label: shift,
    displayText: shift.slice(0, 4) || "?",
  };
}

export function isOffShiftCode(shift: string, storeConfig: StoreConfig): boolean {
  if (shift === "X") return true;
  const cat = findCatalogShift(storeConfig, shift);
  return cat?.category === "off";
}

/** 寫入班表前：竹山僅 A–X；集集可用目錄碼，並相容暫存的 A–E 預設 */
export function assertWritableShiftCode(
  shift: string,
  storeConfig: StoreConfig
): { ok: true } | { ok: false; message: string } {
  if (!storeConfig.features.customShiftCatalog) {
    if (!isLegacyShiftCode(shift)) {
      return { ok: false, message: "竹山班表僅能使用 A–E／X 班別" };
    }
    return { ok: true };
  }
  if (shift === "X" || isLegacyShiftCode(shift)) return { ok: true };
  const cat = findCatalogShift(storeConfig, shift);
  if (!cat || !cat.enabled) {
    return { ok: false, message: `班別「${shift}」不在本店啟用目錄中` };
  }
  return { ok: true };
}
