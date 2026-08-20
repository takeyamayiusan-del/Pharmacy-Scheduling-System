import { describe, expect, it } from "vitest";
import {
  isPunchCorrectionOverLimit,
  punchCorrectionOverLimitMessage,
  punchCorrectionQuotaText,
  friendlyPunchCorrectionDbError,
  normalizeRequestedTime,
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

  it("正規化瀏覽器時間", () => {
    expect(normalizeRequestedTime("9:05")).toBe("09:05:00");
    expect(normalizeRequestedTime("09:05")).toBe("09:05:00");
    expect(normalizeRequestedTime("09:05:00")).toBe("09:05:00");
    expect(normalizeRequestedTime("")).toBeNull();
    expect(normalizeRequestedTime("25:00")).toBeNull();
  });

  it("缺表錯誤改成中文", () => {
    expect(
      friendlyPunchCorrectionDbError(
        "Could not find the table 'public.punch_correction_requests' in the schema cache"
      )
    ).toMatch(/資料表尚未建立/);
  });
});
