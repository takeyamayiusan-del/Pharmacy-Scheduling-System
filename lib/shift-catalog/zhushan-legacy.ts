/**
 * 竹山現行 A–E 班別的目錄鏡像（備而不開）。
 * 程式與集集共用同一套 resolve／options；
 * 竹山 features.customShiftCatalog 維持 false，排班行為不變。
 */

import type { CatalogShift } from "@/lib/shift-catalog/types";

/** 與竹山 shift_time_config／圖例對齊的目錄範本（含預設配色） */
export function buildZhushanLegacyCatalog(): CatalogShift[] {
  return [
    {
      id: "zhushan_A",
      code: "A",
      name: "全天",
      shortLabel: "A",
      category: "all_day",
      workSegments: [
        { start: "08:30", end: "12:00" },
        { start: "13:30", end: "17:00" },
        { start: "19:00", end: "21:00" },
      ],
      breaks: [
        { start: "12:00", end: "13:30" },
        { start: "17:00", end: "19:00" },
      ],
      nominalHours: 9,
      bgColor: "#bfdbfe",
      textColor: "#1e3a8a",
      borderColor: "#60a5fa",
      enabled: true,
      sortOrder: 0,
    },
    {
      id: "zhushan_B",
      code: "B",
      name: "白班",
      shortLabel: "B",
      category: "day",
      workSegments: [
        { start: "08:30", end: "12:00" },
        { start: "13:30", end: "18:00" },
      ],
      breaks: [{ start: "12:00", end: "13:30" }],
      nominalHours: 8,
      bgColor: "#a7f3d0",
      textColor: "#065f46",
      borderColor: "#34d399",
      enabled: true,
      sortOrder: 1,
    },
    {
      id: "zhushan_C",
      code: "C",
      name: "上午",
      shortLabel: "C",
      category: "day",
      workSegments: [{ start: "08:30", end: "12:00" }],
      breaks: [],
      nominalHours: 3.5,
      bgColor: "#fde68a",
      textColor: "#92400e",
      borderColor: "#f59e0b",
      enabled: true,
      sortOrder: 2,
    },
    {
      id: "zhushan_D",
      code: "D",
      name: "下午",
      shortLabel: "D",
      category: "day",
      workSegments: [{ start: "13:30", end: "18:00" }],
      breaks: [],
      nominalHours: 4.5,
      bgColor: "#ddd6fe",
      textColor: "#5b21b6",
      borderColor: "#a78bfa",
      enabled: true,
      sortOrder: 3,
    },
    {
      id: "zhushan_E",
      code: "E",
      name: "下午+晚",
      shortLabel: "E",
      category: "split",
      workSegments: [
        { start: "13:30", end: "17:00" },
        { start: "19:00", end: "21:00" },
      ],
      breaks: [{ start: "17:00", end: "19:00" }],
      nominalHours: 5.5,
      bgColor: "#fecdd3",
      textColor: "#9f1239",
      borderColor: "#fb7185",
      enabled: true,
      sortOrder: 4,
    },
    {
      id: "zhushan_X",
      code: "X",
      name: "休假",
      shortLabel: "休",
      category: "off",
      workSegments: [],
      breaks: [],
      nominalHours: 0,
      bgColor: "#e2e8f0",
      textColor: "#334155",
      borderColor: "#94a3b8",
      enabled: true,
      sortOrder: 5,
    },
  ];
}
