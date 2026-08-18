import { describe, expect, it } from "vitest";
import {
  isLeaveSelectedOnDate,
  resolveShiftForDate,
} from "@/lib/schedule/resolveShiftForDate";

describe("isLeaveSelectedOnDate", () => {
  it("matches YYYY-MM-DD and ISO timestamps", () => {
    expect(isLeaveSelectedOnDate(["2026-08-19"], "2026-08-19")).toBe(true);
    expect(isLeaveSelectedOnDate(["2026-08-19T00:00:00.000Z"], "2026-08-19")).toBe(true);
    expect(isLeaveSelectedOnDate(["2026-08-18"], "2026-08-19")).toBe(false);
  });
});

describe("resolveShiftForDate", () => {
  it("weekday leave shows rest even when override is the default shift", () => {
    expect(
      resolveShiftForDate({
        isSunday: false,
        isActive: true,
        saturdayFixedOff: false,
        leaveSelected: true,
        override: "B",
        baseWorkShift: "B",
      })
    ).toBe("X");
  });

  it("weekday without leave keeps default override", () => {
    expect(
      resolveShiftForDate({
        isSunday: false,
        isActive: true,
        saturdayFixedOff: false,
        leaveSelected: false,
        override: "B",
        baseWorkShift: "C",
      })
    ).toBe("B");
  });

  it("weekday without override uses computed default", () => {
    expect(
      resolveShiftForDate({
        isSunday: false,
        isActive: true,
        saturdayFixedOff: false,
        leaveSelected: false,
        override: null,
        baseWorkShift: "B",
      })
    ).toBe("B");
  });

  it("saturday fixed off still beats override", () => {
    expect(
      resolveShiftForDate({
        isSunday: false,
        isActive: true,
        saturdayFixedOff: true,
        leaveSelected: false,
        override: "C",
        baseWorkShift: "C",
      })
    ).toBe("X");
  });
});
