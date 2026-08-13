import { describe, expect, it } from "vitest";
import { defaultStorePoliciesForSite } from "@/lib/store-policies";
import { saturdayLeaveQuota, weekdayLeaveQuota } from "@/lib/schedule/leaveQuotas";

describe("leaveQuotas", () => {
  it("集集週六配額等於本月週六數", () => {
    const p = defaultStorePoliciesForSite("jiji");
    expect(saturdayLeaveQuota(p, 5)).toBe(5);
    expect(weekdayLeaveQuota(p, false)).toBe(0);
  });

  it("竹山週六／平日各 2 天", () => {
    const p = defaultStorePoliciesForSite("zhushan");
    expect(saturdayLeaveQuota(p, 5)).toBe(2);
    expect(weekdayLeaveQuota(p, false)).toBe(2);
    expect(weekdayLeaveQuota(p, true)).toBe(0);
  });
});
