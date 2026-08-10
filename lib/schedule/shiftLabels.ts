import type { ShiftDisplayConfig } from "@/lib/context/AppContext";
import type { StoreConfig } from "@/lib/store-config";
import { resolveShiftDisplay } from "@/lib/shift-catalog/resolve";

/** 班別顯示名稱（依固定班表設定／目錄） */
export function formatShiftName(
  config: ShiftDisplayConfig,
  shift: string,
  storeConfig?: StoreConfig
): string {
  if (storeConfig) {
    const style = resolveShiftDisplay(shift, storeConfig, config);
    if (shift === "X" || style.label === "休假") return style.label || "休假";
    if (storeConfig.features.customShiftCatalog) {
      return style.label || shift;
    }
    if (style.label) {
      return `${style.displayText}班（${style.label}）`;
    }
    return `${style.displayText}班`;
  }
  const style = config[shift as keyof ShiftDisplayConfig];
  if (!style) return shift;
  if (shift === "X") return style.label || "休假";
  if (style.label) {
    return `${style.displayText}班（${style.label}）`;
  }
  return `${style.displayText}班`;
}
