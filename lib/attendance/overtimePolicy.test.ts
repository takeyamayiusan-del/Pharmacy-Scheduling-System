import { describe, expect, it } from "vitest";
import { defaultStorePoliciesForSite } from "@/lib/store-policies";
import {
  canChooseOvertimePayWithPolicy,
  canSubmitOvertimeRequest,
  resolveCompensationWithPolicy,
  validateOvertimeWithPolicy,
} from "@/lib/attendance/overtimePolicy";

describe("overtimePolicy", () => {
  const jiji = defaultStorePoliciesForSite("jiji");
  const zhushan = defaultStorePoliciesForSite("zhushan");

  it("集集：未滿 30 分不可申請；滿 30 分可申請且不強迫補休", () => {
    expect(canSubmitOvertimeRequest("18:00", "18:20", jiji)).toBe(false);
    expect(validateOvertimeWithPolicy("18:00", "18:20", "pay", jiji)).toMatch(/未滿 30 分鐘/);
    expect(canSubmitOvertimeRequest("18:00", "18:30", jiji)).toBe(true);
    expect(canChooseOvertimePayWithPolicy("18:00", "19:30", jiji)).toBe(true);
    expect(resolveCompensationWithPolicy("18:00", "19:30", "pay", jiji)).toBe("pay");
    expect(validateOvertimeWithPolicy("18:00", "19:30", "pay", jiji)).toBeNull();
  });

  it("竹山：超過 30 分僅能補休", () => {
    expect(canChooseOvertimePayWithPolicy("18:00", "18:30", zhushan)).toBe(true);
    expect(canChooseOvertimePayWithPolicy("18:00", "18:31", zhushan)).toBe(false);
    expect(resolveCompensationWithPolicy("18:00", "19:00", "pay", zhushan)).toBe("time_off");
    expect(validateOvertimeWithPolicy("18:00", "19:00", "pay", zhushan)).toMatch(/僅能申請補休/);
  });
});
