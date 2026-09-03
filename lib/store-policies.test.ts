import { describe, expect, it } from "vitest";
import {
  defaultStorePoliciesForSite,
  parseStorePolicies,
} from "@/lib/store-policies";

describe("store-policies", () => {
  it("竹山預設維持原行為，但不綁死店別", () => {
    const z = defaultStorePoliciesForSite("zhushan");
    expect(z.earlyPunchMinutes).toBe(10);
    expect(z.overtimeRedirectMinutes).toBe(10);
    expect(z.overtimeMinApplyMinutes).toBe(30);
    expect(z.overtimeForceCompLeaveAfterMinutes).toBe(60);
    expect(z.overtimeMealDeductAfterMinutes).toBe(240);
    expect(z.overtimeMealDeductMinutes).toBe(30);
    expect(z.saturdayQuotaMode).toBe("fixed");
    expect(z.saturdayLeaveQuota).toBe(2);
    expect(z.weekdayLeaveQuota).toBe(2);
    expect(z.approvalChain).toEqual(["manager"]);
    expect(z.approvalMode).toBe("any");
    expect(parseStorePolicies({}, "zhushan").approvalMode).toBe("any");
    expect(z.autoRestSuggestEnabled).toBe(false);
    expect(z.allowLeaveDeferral).toBe(false);
    expect(z.leaveHoursPerDay).toBe(8);
    expect(z.leaveRules["婚假"]?.daysLimit).toBe(8);
    expect(z.leaveRules["事假"]?.payKind).toBe("unpaid");
    expect(z.leaveRules["公假"]?.payKind).toBe("paid");
  });

  it("兩店加班規則預設相同", () => {
    const z = defaultStorePoliciesForSite("zhushan");
    const j = defaultStorePoliciesForSite("jiji");
    expect(j.overtimeMinApplyMinutes).toBe(z.overtimeMinApplyMinutes);
    expect(j.overtimeForceCompLeaveAfterMinutes).toBe(z.overtimeForceCompLeaveAfterMinutes);
    expect(j.overtimeMealDeductAfterMinutes).toBe(z.overtimeMealDeductAfterMinutes);
    expect(j.overtimeMealDeductMinutes).toBe(z.overtimeMealDeductMinutes);
  });

  it("竹山可改成集集那套規則（客製化）", () => {
    const next = parseStorePolicies(
      {
        overtimeMinApplyMinutes: 30,
        overtimeForceCompLeaveAfterMinutes: null,
        saturdayQuotaMode: "month_pool",
        weekdayLeaveQuota: 0,
        approvalChain: ["manager", "deputy", "owner"],
        autoRestSuggestEnabled: true,
        allowLeaveDeferral: true,
      },
      "zhushan"
    );
    expect(next.overtimeMinApplyMinutes).toBe(30);
    expect(next.overtimeForceCompLeaveAfterMinutes).toBeNull();
    expect(next.saturdayQuotaMode).toBe("month_pool");
    expect(next.weekdayLeaveQuota).toBe(0);
    expect(next.approvalChain).toEqual(["manager", "deputy", "owner"]);
    expect(next.autoRestSuggestEnabled).toBe(true);
    expect(next.earlyPunchMinutes).toBe(10);
  });

  it("未寫入的欄位沿用該店預設，不因缺欄而改成 true", () => {
    const z = parseStorePolicies({}, "zhushan");
    expect(z.autoRestSuggestEnabled).toBe(false);
    expect(z.allowLeaveDeferral).toBe(false);
    expect(z.saturdayQuotaMode).toBe("fixed");
    const j = parseStorePolicies({}, "jiji");
    expect(j.autoRestSuggestEnabled).toBe(true);
    expect(j.saturdayQuotaMode).toBe("month_pool");
    expect(j.approvalMode).toBe("sequential");
    expect(j.approvalChain).toEqual(["manager", "deputy", "owner"]);
  });

  it("舊集集 all_saturdays + 平日 0 會讀成整月池", () => {
    const j = parseStorePolicies(
      { saturdayQuotaMode: "all_saturdays", weekdayLeaveQuota: 0 },
      "jiji"
    );
    expect(j.saturdayQuotaMode).toBe("month_pool");
  });

  it("假別上限可覆寫勞基預設", () => {
    const next = parseStorePolicies(
      {
        leaveHoursPerDay: 9,
        leaveRules: {
          婚假: { daysLimit: 10, payKind: "paid" },
          事假: { daysLimit: null, payKind: "unpaid" },
        },
      },
      "zhushan"
    );
    expect(next.leaveHoursPerDay).toBe(9);
    expect(next.leaveRules["婚假"]?.daysLimit).toBe(10);
    expect(next.leaveRules["事假"]?.daysLimit).toBeNull();
    expect(next.leaveRules["產假"]?.daysLimit).toBe(56);
  });
});
