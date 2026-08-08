/** 進階班別目錄（集集／總店用）；竹山不啟用，排班仍走 A–E */

export type ShiftCategory = "day" | "mid" | "night" | "split" | "all_day" | "off" | "other";

export type TimeRange = {
  start: string; // HH:mm
  end: string;
};

export type CatalogShift = {
  id: string;
  /** 短碼（班表用）；可為中文簡稱 */
  code: string;
  name: string;
  category: ShiftCategory;
  /** 實際上班段（兩頭班可多段） */
  workSegments: TimeRange[];
  /** 休息段 */
  breaks: TimeRange[];
  /** 表定工時 */
  nominalHours: number;
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
