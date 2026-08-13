/** 進階班別目錄（集集／總店用）；竹山不啟用，排班仍走 A–E */

export type ShiftCategory = "day" | "mid" | "night" | "split" | "all_day" | "off" | "other";

export type TimeRange = {
  start: string; // HH:mm
  end: string;
};

export type CatalogShift = {
  id: string;
  /**
   * 識別碼（寫入班表／固定班）；穩定後勿隨意改名，否則舊班表對不到。
   * 可與名稱相同（如白班2）。
   */
  code: string;
  name: string;
  /**
   * 班表格子顯示短碼（如白2、晚1）。
   * 未設時由 code 推導。
   */
  shortLabel: string;
  category: ShiftCategory;
  /** 實際上班段（兩頭班可多段） */
  workSegments: TimeRange[];
  /** 休息段 */
  breaks: TimeRange[];
  /** 表定工時 */
  nominalHours: number;
  /** 計工時／計薪時數；未填則用表定工時（例如 11.5 記成 12） */
  countedHours: number | null;
  /** 班表格子／圖例背景色 */
  bgColor: string;
  /** 班表格子／圖例文字色 */
  textColor: string;
  /** 班表格子／圖例框線色 */
  borderColor: string;
  enabled: boolean;
  sortOrder: number;
};

export const SHIFT_CATEGORY_LABELS: Record<ShiftCategory, string> = {
  day: "白班",
  mid: "中班",
  night: "晚班",
  split: "兩頭班",
  all_day: "整天班",
  off: "休假",
  other: "其他",
};

/**
 * 由識別碼推導班表短碼：白班2→白2、晚班1→晚1、兩頭班兩段班1→兩1。
 */
export function deriveShortLabel(code: string, category?: ShiftCategory): string {
  const c = code.trim();
  if (!c) return category === "off" ? "休" : "?";
  if (c === "X" || category === "off") {
    if (/休/.test(c)) return "休";
    return c === "X" ? "休" : c.slice(0, 4);
  }
  const prefix = c.match(/^(白|中|晚|兩|整|休)/)?.[1];
  const num = c.match(/(\d+)\s*$/)?.[1];
  if (prefix && num) return `${prefix}${num}`.slice(0, 6);
  if (prefix) return prefix.slice(0, 6);
  return c.slice(0, 4);
}
