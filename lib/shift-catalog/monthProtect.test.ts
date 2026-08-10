import { describe, expect, it } from "vitest";
import {
  collectFixedShiftCodes,
  collectShiftCodesUsedInMonth,
  formatMonthKey,
  formatMonthLabelZh,
  guardCatalogIdentityChange,
  isDateInMonthKey,
} from "@/lib/shift-catalog/monthProtect";

describe("monthProtect", () => {
  it("detects dates in month key", () => {
    expect(isDateInMonthKey("2026-08-15", "2026-08")).toBe(true);
    expect(isDateInMonthKey("2026-09-01", "2026-08")).toBe(false);
    expect(formatMonthLabelZh("2026-08")).toBe("2026年8月");
    expect(formatMonthKey(new Date(2026, 7, 10))).toBe("2026-08");
  });

  it("collects codes only from current month and site employees", () => {
    const schedule = {
      "2026-08-10": { e1: "白班5", e2: "晚班1", other: "白班1" },
      "2026-09-01": { e1: "白班2" },
    };
    const used = collectShiftCodesUsedInMonth(
      schedule,
      "2026-08",
      new Set(["e1", "e2"])
    );
    expect(Array.from(used).sort()).toEqual(["晚班1", "白班5"]);
  });

  it("blocks delete/rename when used this month or in fixed shifts", () => {
    expect(
      guardCatalogIdentityChange({
        action: "delete",
        code: "白班5",
        monthKey: "2026-08",
        usedInCurrentMonth: true,
        usedInFixedShifts: false,
      }).ok
    ).toBe(false);

    expect(
      guardCatalogIdentityChange({
        action: "rename",
        code: "白班5",
        usedInCurrentMonth: false,
        usedInFixedShifts: true,
      }).ok
    ).toBe(false);

    expect(
      guardCatalogIdentityChange({
        action: "delete",
        code: "新班",
        usedInCurrentMonth: false,
        usedInFixedShifts: false,
      })
    ).toEqual({ ok: true });
  });

  it("collects fixed shift codes for site", () => {
    const used = collectFixedShiftCodes(
      [
        { employeeId: "e1", shift: "白班5" },
        { employeeId: "other", shift: "晚班1" },
        { employeeId: "e2", shift: "X" },
      ],
      new Set(["e1", "e2"])
    );
    expect(Array.from(used)).toEqual(["白班5"]);
  });
});
