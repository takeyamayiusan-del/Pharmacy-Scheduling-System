/**
 * 勞基法變形工時制度（店家標記用）。
 * 目前供設定／顯示與後續週期工時檢查；尚未自動計算週期加班上限。
 */

export type WorkHoursRegime = "two_week" | "eight_week";

export const WORK_HOURS_REGIME_OPTIONS: Array<{
  value: WorkHoursRegime;
  label: string;
  cycleWeeks: number;
  /** 週期內正常工時上限（小時） */
  cycleHoursCap: number;
  summary: string;
}> = [
  {
    value: "two_week",
    label: "兩周變形工時",
    cycleWeeks: 2,
    cycleHoursCap: 80,
    summary: "以兩周為一週期，正常工時上限 80 小時（竹山現況）。",
  },
  {
    value: "eight_week",
    label: "八周變形工時",
    cycleWeeks: 8,
    cycleHoursCap: 320,
    summary: "以八周為一週期，正常工時上限 320 小時（集集現況）。",
  },
];

export function isWorkHoursRegime(v: unknown): v is WorkHoursRegime {
  return v === "two_week" || v === "eight_week";
}

export function defaultWorkHoursRegimeForSite(
  siteId: "zhushan" | "jiji" | string
): WorkHoursRegime {
  return siteId === "jiji" ? "eight_week" : "two_week";
}

export function workHoursRegimeMeta(regime: WorkHoursRegime) {
  return (
    WORK_HOURS_REGIME_OPTIONS.find((o) => o.value === regime) ??
    WORK_HOURS_REGIME_OPTIONS[0]
  );
}
