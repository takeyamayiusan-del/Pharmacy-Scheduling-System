import { describe, expect, it } from "vitest";
import {
  isPunchCorrectionOverLimit,
  punchCorrectionOverLimitMessage,
  punchCorrectionQuotaText,
} from "@/lib/attendance/punchCorrectionLimit";

describe("punch correction monthly limit", () => {
  it("null 表示不限次數", () => {
    expect(isPunchCorrectionOverLimit(99, null)).toBe(false);
    expect(punchCorrectionQuotaText(2, null)).toBe("本月已申請 2 次（不限）");
  });

  it("pending+approved 達上限不可再申請", () => {
    expect(isPunchCorrectionOverLimit(2, 2)).toBe(true);
    expect(isPunchCorrectionOverLimit(1, 2)).toBe(false);
    expect(punchCorrectionQuotaText(1, 2)).toBe("本月已申請 1 / 2 次");
    expect(punchCorrectionOverLimitMessage(2)).toContain("2 次上限");
  });
});
