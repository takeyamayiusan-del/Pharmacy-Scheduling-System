import { describe, expect, it } from "vitest";
import {
  canChooseOvertimePay,
  calcOvertimeMinutes,
  resolveAllowedCompensationType,
  validateOvertimeCompensation,
} from "@/lib/attendance/overtimeCompensation";

describe("overtimeCompensation", () => {
  it("計算加班分鐘", () => {
    expect(calcOvertimeMinutes("18:00", "18:30")).toBe(30);
    expect(calcOvertimeMinutes("18:00", "18:20")).toBe(20);
    expect(calcOvertimeMinutes("18:00", "19:00")).toBe(60);
    expect(calcOvertimeMinutes("19:00", "18:00")).toBe(0);
  });

  it("半小時內可選加班費", () => {
    expect(canChooseOvertimePay("18:00", "18:30")).toBe(true);
    expect(canChooseOvertimePay("18:00", "18:15")).toBe(true);
    expect(canChooseOvertimePay("18:00", "18:31")).toBe(false);
    expect(canChooseOvertimePay("08:00", "17:00")).toBe(false);
  });

  it("超過半小時強制改為補休", () => {
    expect(resolveAllowedCompensationType("18:00", "19:00", "pay")).toBe("time_off");
    expect(resolveAllowedCompensationType("18:00", "18:20", "pay")).toBe("pay");
  });

  it("驗證錯誤訊息", () => {
    expect(validateOvertimeCompensation("18:00", "18:20", "pay")).toBeNull();
    expect(validateOvertimeCompensation("18:00", "19:00", "pay")).toMatch(/僅能申請補休/);
    expect(validateOvertimeCompensation("18:00", "19:00", "time_off")).toBeNull();
  });
});
