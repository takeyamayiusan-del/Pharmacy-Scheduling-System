import { describe, expect, it } from "vitest";
import {
  defaultWorkHoursRegimeForSite,
  isWorkHoursRegime,
  workHoursRegimeMeta,
} from "@/lib/attendance/workHoursRegime";

describe("workHoursRegime", () => {
  it("defaults zhushan two-week and jiji eight-week with legal daily caps", () => {
    expect(defaultWorkHoursRegimeForSite("zhushan")).toBe("two_week");
    expect(defaultWorkHoursRegimeForSite("jiji")).toBe("eight_week");
    expect(workHoursRegimeMeta("two_week").cycleHoursCap).toBe(80);
    expect(workHoursRegimeMeta("two_week").dailyNormalHoursCap).toBe(10);
    expect(workHoursRegimeMeta("eight_week").cycleHoursCap).toBe(320);
    expect(workHoursRegimeMeta("eight_week").dailyNormalHoursCap).toBe(8);
  });

  it("validates regime values", () => {
    expect(isWorkHoursRegime("two_week")).toBe(true);
    expect(isWorkHoursRegime("eight_week")).toBe(true);
    expect(isWorkHoursRegime("none")).toBe(false);
  });
});
