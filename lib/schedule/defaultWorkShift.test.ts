import { describe, expect, it } from "vitest";
import { resolveDefaultWorkShift } from "@/lib/schedule/defaultWorkShift";

describe("resolveDefaultWorkShift", () => {
  it("週日固定公休", () => {
    expect(
      resolveDefaultWorkShift({
        isSunday: true,
        isSaturday: false,
        baselineShift: "白班5",
        defaultSaturdayShift: "C",
        defaultWeekdayShift: "B",
      })
    ).toBe("X");
  });

  it("平日沒固定班時用個人基準班", () => {
    expect(
      resolveDefaultWorkShift({
        isSunday: false,
        isSaturday: false,
        baselineShift: "白班5",
        defaultSaturdayShift: "C",
        defaultWeekdayShift: "B",
      })
    ).toBe("白班5");
  });

  it("平日固定班優先於基準班", () => {
    expect(
      resolveDefaultWorkShift({
        isSunday: false,
        isSaturday: false,
        fixedShift: "晚班1",
        baselineShift: "白班5",
        defaultSaturdayShift: "C",
        defaultWeekdayShift: "B",
      })
    ).toBe("晚班1");
  });

  it("週六用固定班，否則店家週六預設", () => {
    expect(
      resolveDefaultWorkShift({
        isSunday: false,
        isSaturday: true,
        baselineShift: "白班5",
        defaultSaturdayShift: "C",
        defaultWeekdayShift: "B",
      })
    ).toBe("C");
  });
});
