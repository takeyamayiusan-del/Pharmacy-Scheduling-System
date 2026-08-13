/**
 * 勞基法變形工時制度（店家設定＋班表軟性合規提醒）。
 *
 * 對照重點（正常工時，不含延長工時／加班）：
 * - 兩周變形（§30Ⅱ）：週期 2 周、上限 80h；單日正常工時最多 10h
 * - 八周變形（§30Ⅲ）：週期 8 周、上限 320h；單日正常工時最多 8h
 * - 例假（§36）：每七日至少應有一日例假
 *
 * 起算日依事業單位核備／約定，非法條固定「每月1日」。
 * 系統目前為軟性提醒，不取代正式勞檢或加班計算。
 */

export type WorkHoursRegime = "standard" | "two_week" | "four_week" | "eight_week";

export type WorkHoursRegimeMeta = {
  value: WorkHoursRegime;
  label: string;
  /** 勞基法條次簡稱（顯示用） */
  legalRef: string;
  cycleWeeks: number;
  /** 週期內正常工時上限（小時） */
  cycleHoursCap: number;
  /** 單日正常工時上限（小時） */
  dailyNormalHoursCap: number;
  summary: string;
};

export const WORK_HOURS_REGIME_OPTIONS: WorkHoursRegimeMeta[] = [
  {
    value: "standard",
    label: "正常工時",
    legalRef: "勞基法第30條第1項",
    cycleWeeks: 1,
    cycleHoursCap: 40,
    dailyNormalHoursCap: 8,
    summary:
      "每日正常工時原則 8 小時、每週 40 小時。未約定變形工時時使用。系統僅警示、不硬擋。",
  },
  {
    value: "two_week",
    label: "兩周變形工時",
    legalRef: "勞基法第30條第2項",
    cycleWeeks: 2,
    cycleHoursCap: 80,
    dailyNormalHoursCap: 10,
    summary:
      "兩周為一週期，正常工時合計不得超過 80 小時；單日正常工時最多 10 小時。起算日依核備／約定，非每月1日。",
  },
  {
    value: "four_week",
    label: "四周變形工時",
    legalRef: "勞基法第30條之1",
    cycleWeeks: 4,
    cycleHoursCap: 168,
    dailyNormalHoursCap: 10,
    summary:
      "四周為一週期，正常工時合計不得超過 168 小時；單日正常工時最多 10 小時。系統僅警示、不硬擋。",
  },
  {
    value: "eight_week",
    label: "八周變形工時",
    legalRef: "勞基法第30條第3項",
    cycleWeeks: 8,
    cycleHoursCap: 320,
    dailyNormalHoursCap: 8,
    summary:
      "八周為一週期，正常工時合計不得超過 320 小時；單日正常工時最多 8 小時。起算日依核備／約定，非每月1日。",
  },
];

export function isWorkHoursRegime(v: unknown): v is WorkHoursRegime {
  return v === "standard" || v === "two_week" || v === "four_week" || v === "eight_week";
}

export function defaultWorkHoursRegimeForSite(
  siteId: "zhushan" | "jiji" | string
): WorkHoursRegime {
  return siteId === "jiji" ? "eight_week" : "two_week";
}

export function workHoursRegimeMeta(regime: WorkHoursRegime): WorkHoursRegimeMeta {
  return (
    WORK_HOURS_REGIME_OPTIONS.find((o) => o.value === regime) ??
    WORK_HOURS_REGIME_OPTIONS[0]
  );
}
