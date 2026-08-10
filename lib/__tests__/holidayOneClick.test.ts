import { describe, expect, it } from "vitest";
import {
  buildHolidayOneClickChanges,
  getHolidayWorkShiftOptions,
  resolveHolidayOneClickShift,
  resolveHolidayWorkShift,
} from "@/lib/schedule/holidayOneClick";
import { defaultStoreConfigForSite, buildJijiStoreConfigWithTemplate } from "@/lib/store-config";

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

  it("基準班若為 X 則改為後備班（預設 B）", () => {
    expect(
      resolveHolidayOneClickShift({
        mode: "work",
        workShift: "X",
        hasLeaveSelection: false,
        hasApprovedFullDayLeave: false,
      })
    ).toBe("B");
  });

  it("基準班為 X 時可用集集預設班當後備", () => {
    expect(
      resolveHolidayOneClickShift({
        mode: "work",
        workShift: "X",
        hasLeaveSelection: false,
        hasApprovedFullDayLeave: false,
        fallbackWorkShift: "白班5",
      })
    ).toBe("白班5");
  });
});

describe("resolveHolidayWorkShift", () => {
  it("auto 使用基準班", () => {
    expect(resolveHolidayWorkShift("auto", "C")).toBe("C");
  });

  it("指定班別優先於基準班", () => {
    expect(resolveHolidayWorkShift("A", "C")).toBe("A");
  });

  it("可指定目錄班碼", () => {
    expect(resolveHolidayWorkShift("白班2", "白班5")).toBe("白班2");
  });
});

describe("getHolidayWorkShiftOptions", () => {
  it("竹山僅 A–E", () => {
    const opts = getHolidayWorkShiftOptions(defaultStoreConfigForSite("zhushan"));
    expect(opts.map((o) => o.value)).toEqual(["auto", "A", "B", "C", "D", "E"]);
  });

  it("集集含目錄班碼", () => {
    const opts = getHolidayWorkShiftOptions(buildJijiStoreConfigWithTemplate());
    expect(opts[0].value).toBe("auto");
    expect(opts.some((o) => o.value === "白班2")).toBe(true);
    expect(opts.some((o) => o.value === "A")).toBe(false);
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

  it("指定班別時全員寫入該班，排休者仍維持 X", () => {
    const changes = buildHolidayOneClickChanges({
      date: "2026-10-10",
      mode: "work",
      workShiftChoice: "C",
      employeeIds: ["a", "b", "c"],
      getCurrentShift: (id) => (id === "a" ? "B" : id === "b" ? "C" : "X"),
      getWorkShift: () => "B",
      hasLeaveSelection: (id) => id === "c",
      hasApprovedFullDayLeave: () => false,
    });

    expect(changes).toEqual([
      { employeeId: "a", date: "2026-10-10", from: "B", to: "C" },
    ]);
  });

  it("指定目錄班碼時寫入該碼", () => {
    const changes = buildHolidayOneClickChanges({
      date: "2026-10-10",
      mode: "work",
      workShiftChoice: "白班2",
      fallbackWorkShift: "白班5",
      employeeIds: ["a"],
      getCurrentShift: () => "白班5",
      getWorkShift: () => "白班5",
      hasLeaveSelection: () => false,
      hasApprovedFullDayLeave: () => false,
    });
    expect(changes).toEqual([
      { employeeId: "a", date: "2026-10-10", from: "白班5", to: "白班2" },
    ]);
  });
});
