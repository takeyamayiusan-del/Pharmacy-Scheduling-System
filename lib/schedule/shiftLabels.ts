import type { ShiftDisplayConfig, ShiftType } from "@/lib/context/AppContext";

/** 班別顯示名稱（依固定班表設定） */
export function formatShiftName(
  config: ShiftDisplayConfig,
  shift: ShiftType
): string {
  const style = config[shift];
  if (!style) return shift;
  if (shift === "X") return style.label || "休假";
  if (style.label) {
    return `${style.displayText}班（${style.label}）`;
  }
  return `${style.displayText}班`;
}
