import { describe, expect, it } from "vitest";
import {
  buildHolidayOneClickChanges,
  resolveHolidayOneClickShift,
} from "@/lib/schedule/holidayOneClick";

describe("resolveHolidayOneClickShift", () => {
  it("設為休假時一律回傳 X", () => {
    expect(
      resolveHolidayOneClickShift({
        mode: "off",
        workShift: "A",
        hasLeaveSelection: false,
        hasApprovedFullDayLeave: false,
      })
    ).toBe("X");
  });

  it("設為上班時依基準班寫入", () => {
    expect(
      resolveHolidayOneClickShift({
        mode: "work",
        workShift: "C",
        hasLeaveSelection: false,
        hasApprovedFullDayLeave: false,
      })
    ).toBe("C");
  });

  it("設為上班時已排休者維持休假", () => {
    expect(
      resolveHolidayOneClickShift({
        mode: "work",
        workShift: "A",
        hasLeaveSelection: true,
        hasApprovedFullDayLeave: false,
      })
    ).toBe("X");
  });

  it("設為上班時全日請假者維持休假", () => {
    expect(
      resolveHolidayOneClickShift({
        mode: "work",
        workShift: "B",
        hasLeaveSelection: false,
        hasApprovedFullDayLeave: true,
      })
    ).toBe("X");
  });

  it("基準班若為 X 則改為 B（避免全員無班）", () => {
    expect(
      resolveHolidayOneClickShift({
        mode: "work",
        workShift: "X",
        hasLeaveSelection: false,
        hasApprovedFullDayLeave: false,
      })
    ).toBe("B");
  });
});

describe("buildHolidayOneClickChanges", () => {
  it("略過無需變更的員工，並保留排休者為 X", () => {
    const changes = buildHolidayOneClickChanges({
      date: "2026-10-10",
      mode: "work",
      employeeIds: ["a", "b", "c"],
      getCurrentShift: (id) => (id === "a" ? "X" : id === "b" ? "A" : "X"),
      getWorkShift: () => "A",
      hasLeaveSelection: (id) => id === "c",
      hasApprovedFullDayLeave: () => false,
    });

    expect(changes).toEqual([
      { employeeId: "a", date: "2026-10-10", from: "X", to: "A" },
    ]);
  });
});
