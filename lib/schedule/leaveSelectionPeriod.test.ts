import { describe, expect, it } from "vitest";
import {
  isShiftRestLeavePeriod,
  leaveSelectionUsesWorkShift,
  parseLeaveSelectionPeriod,
} from "@/lib/schedule/leaveSelectionPeriod";

describe("leaveSelectionPeriod shift_rest", () => {
  it("parses shift_rest period", () => {
    expect(parseLeaveSelectionPeriod("shift_rest")).toBe("shift_rest");
  });

  it("uses work shift for shift_rest selections", () => {
    expect(
      leaveSelectionUsesWorkShift({ period: "shift_rest", workShift: "白班5" })
    ).toBe(true);
    expect(
      leaveSelectionUsesWorkShift({ period: "full_day", workShift: null })
    ).toBe(false);
  });

  it("identifies shift_rest period", () => {
    expect(isShiftRestLeavePeriod("shift_rest")).toBe(true);
    expect(isShiftRestLeavePeriod("morning")).toBe(false);
  });
});
