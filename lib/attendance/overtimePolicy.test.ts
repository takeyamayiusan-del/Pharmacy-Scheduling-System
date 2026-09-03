import { describe, expect, it } from "vitest";
import { defaultStorePoliciesForSite } from "@/lib/store-policies";
import {
  canChooseOvertimePayWithPolicy,
  canSubmitOvertimeRequest,
  resolveCompensationWithPolicy,
  resolveOvertimeCreditedMinutes,
  validateOvertimeWithPolicy,
} from "@/lib/attendance/overtimePolicy";

describe("overtimePolicy", () => {
  const jiji = defaultStorePoliciesForSite("jiji");
  const zhushan = defaultStorePoliciesForSite("zhushan");

  it("兩店統一：未滿 30 分不可申請；滿 30 分可申請", () => {
    for (const policies of [jiji, zhushan]) {
      expect(canSubmitOvertimeRequest("18:00", "18:20", policies)).toBe(false);
      expect(validateOvertimeWithPolicy("18:00", "18:20", "pay", policies)).toMatch(/未滿 30/);
      expect(canSubmitOvertimeRequest("18:00", "18:30", policies)).toBe(true);
    }
  });

  it("兩店統一：60 分以內可選加班費；超過僅補休", () => {
    for (const policies of [jiji, zhushan]) {
      expect(canChooseOvertimePayWithPolicy("18:00", "18:30", policies)).toBe(true);
      expect(canChooseOvertimePayWithPolicy("18:00", "19:00", policies)).toBe(true);
      expect(canChooseOvertimePayWithPolicy("18:00", "19:01", policies)).toBe(false);
      expect(resolveCompensationWithPolicy("18:00", "20:00", "pay", policies)).toBe("time_off");
      expect(validateOvertimeWithPolicy("18:00", "20:00", "pay", policies)).toMatch(/僅能申請補休/);
    }
  });

  it("逾 4 小時自動扣 30 分用餐並提醒", () => {
    const credited = resolveOvertimeCreditedMinutes("18:00", "22:30", zhushan);
    expect(credited.rawMinutes).toBe(270);
    expect(credited.deductedMinutes).toBe(30);
    expect(credited.creditedMinutes).toBe(240);
    expect(credited.creditedHours).toBe(4);
    expect(credited.reminder).toMatch(/已自動扣除用餐/);
  });

  it("未逾 4 小時不扣用餐", () => {
    const credited = resolveOvertimeCreditedMinutes("18:00", "21:00", jiji);
    expect(credited.rawMinutes).toBe(180);
    expect(credited.deductedMinutes).toBe(0);
    expect(credited.reminder).toBeNull();
  });
});
