import { describe, expect, it } from "vitest";
import { defaultStoreConfigForSite } from "@/lib/store-config";
import {
  resolveEmployeeCycleAnchor,
  resolveEmployeeWorkHoursRegime,
} from "@/lib/attendance/employeeRegime";

describe("employeeRegime", () => {
  it("個人制度優先，空則跟店", () => {
    const store = defaultStoreConfigForSite("jiji");
    expect(resolveEmployeeWorkHoursRegime({ workHoursRegime: null }, store)).toBe(
      "eight_week"
    );
    expect(
      resolveEmployeeWorkHoursRegime({ workHoursRegime: "two_week" }, store)
    ).toBe("two_week");
  });

  it("店規從入職日起算時，週期錨點用入職日", () => {
    const store = defaultStoreConfigForSite("jiji");
    expect(store.policies.workHoursCycleFromHireDate).toBe(true);
    expect(
      resolveEmployeeCycleAnchor(
        { hireDate: "2026-03-12" },
        store,
        store.policies
      )
    ).toBe("2026-03-12");
  });

  it("關閉從入職日起算時，用店家週期起算日", () => {
    const store = defaultStoreConfigForSite("zhushan");
    expect(store.policies.workHoursCycleFromHireDate).toBe(false);
    expect(
      resolveEmployeeCycleAnchor(
        { hireDate: "2026-03-12" },
        store,
        store.policies
      )
    ).toBe(store.workHoursCycleAnchor);
  });
});
