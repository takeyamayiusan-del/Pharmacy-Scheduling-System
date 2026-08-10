import type { ShiftCategory } from "@/lib/shift-catalog/types";

/** 依班別類型的預設配色（未客製時使用） */
export const CATEGORY_STYLE: Record<
  ShiftCategory,
  { bgColor: string; textColor: string; borderColor: string }
> = {
  day: { bgColor: "#dbeafe", textColor: "#1e40af", borderColor: "#60a5fa" },
  mid: { bgColor: "#ffedd5", textColor: "#9a3412", borderColor: "#fb923c" },
  night: { bgColor: "#e0e7ff", textColor: "#3730a3", borderColor: "#818cf8" },
  split: { bgColor: "#fce7f3", textColor: "#9d174d", borderColor: "#f472b6" },
  all_day: { bgColor: "#d1fae5", textColor: "#065f46", borderColor: "#34d399" },
  off: { bgColor: "#e2e8f0", textColor: "#334155", borderColor: "#94a3b8" },
  other: { bgColor: "#f3f4f6", textColor: "#374151", borderColor: "#9ca3af" },
};

export function defaultColorsForCategory(category: ShiftCategory) {
  return { ...CATEGORY_STYLE[category] };
}

export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function parseHexColor(v: unknown, fallback: string): string {
  return isHexColor(v) ? v.toLowerCase() : fallback;
}
