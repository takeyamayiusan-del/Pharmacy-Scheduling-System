import { describe, expect, it } from "vitest";
import { defaultStorePoliciesForSite } from "@/lib/store-policies";
import {
  canSelectLeaveDate,
  isMonthPoolLeaveQuota,
  leaveAddBlockedMessage,
  leaveQuotaHint,
  saturdayLeaveQuota,
  weekdayLeaveQuota,
} from "@/lib/schedule/leaveQuotas";

describe("leaveQuotas", () => {
  it("集集週六配額等於本月週六數，並視為整月池", () => {
    const p = defaultStorePoliciesForSite("jiji");
    expect(p.saturdayQuotaMode).toBe("month_pool");
    expect(isMonthPoolLeaveQuota(p)).toBe(true);
    expect(saturdayLeaveQuota(p, 5)).toBe(5);
    expect(weekdayLeaveQuota(p, false)).toBe(0);
  });

  it("舊 all_saturdays + 平日 0 仍視為整月池", () => {
    const p = {
      ...defaultStorePoliciesForSite("jiji"),
      saturdayQuotaMode: "all_saturdays" as const,
      weekdayLeaveQuota: 0,
    };
    expect(isMonthPoolLeaveQuota(p)).toBe(true);
    expect(
      canSelectLeaveDate({
        date: "2026-08-03",
        selectedDates: [],
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
      })
    ).toBe(true);
  });

  it("整月池用完後週一到週六都不能再選", () => {
    const p = defaultStorePoliciesForSite("jiji");
    const selected = [
      "2026-08-03",
      "2026-08-04",
      "2026-08-10",
      "2026-08-11",
      "2026-08-17",
    ];
    expect(
      canSelectLeaveDate({
        date: "2026-08-18",
        selectedDates: selected,
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
      })
    ).toBe(false);
    expect(
      leaveAddBlockedMessage({
        date: "2026-08-18",
        selectedDates: selected,
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
      })
    ).toContain("本月排休已達 5 天");
  });

  it("整月池週日仍不可選", () => {
    const p = defaultStorePoliciesForSite("jiji");
    expect(
      leaveAddBlockedMessage({
        date: "2026-08-02",
        selectedDates: [],
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
      })
    ).toContain("禮拜日");
  });

  it("關閉週日公休後週日可排休", () => {
    const p = {
      ...defaultStorePoliciesForSite("jiji"),
      sundayFixedRest: false,
    };
    expect(
      canSelectLeaveDate({
        date: "2026-08-02",
        selectedDates: [],
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
      })
    ).toBe(true);
    expect(
      leaveAddBlockedMessage({
        date: "2026-08-02",
        selectedDates: [],
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
      })
    ).toBeNull();
  });

  it("竹山週六／平日各 2 天", () => {
    const p = defaultStorePoliciesForSite("zhushan");
    expect(isMonthPoolLeaveQuota(p)).toBe(false);
    expect(saturdayLeaveQuota(p, 5)).toBe(2);
    expect(weekdayLeaveQuota(p, false)).toBe(2);
    expect(weekdayLeaveQuota(p, true)).toBe(0);
    expect(
      canSelectLeaveDate({
        date: "2026-08-03",
        selectedDates: ["2026-08-04", "2026-08-05"],
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
      })
    ).toBe(false);
  });

  it("半天規則必須指定上午或下午與剩下半天班別", () => {
    const p = defaultStorePoliciesForSite("jiji");
    expect(
      leaveAddBlockedMessage({
        date: "2026-08-03",
        selectedDates: [],
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
        isHalfDayLeaveRule: true,
      })
    ).toContain("只能休半天");
    expect(
      leaveAddBlockedMessage({
        date: "2026-08-03",
        selectedDates: [],
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
        isHalfDayLeaveRule: true,
        period: "morning",
      })
    ).toContain("剩下半天");
    expect(
      leaveAddBlockedMessage({
        date: "2026-08-03",
        selectedDates: [],
        policies: p,
        isWeekdayOffRule: false,
        saturdaysInMonth: 5,
        isHalfDayLeaveRule: true,
        period: "afternoon",
        workShift: "白班5",
      })
    ).toBeNull();
  });

  it("集集說明改為整月可休", () => {
    const p = defaultStorePoliciesForSite("jiji");
    expect(leaveQuotaHint(p, 5, false)).toContain("週一至週六皆可休");
    expect(leaveQuotaHint(p, 5, false)).toContain("5 天");
    expect(leaveQuotaHint(p, 5, false)).toContain("排休半天也算一次機會");
  });
});
