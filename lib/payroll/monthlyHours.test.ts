import { describe, expect, it } from "vitest";
import {
  getDefaultPayrollPeriod,
  computeMonthlyAttendanceHours,
} from "./monthlyHours";
import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";

const shiftTimeConfig: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

describe("getDefaultPayrollPeriod", () => {
  it("defaults to previous month (Aug → Jul)", () => {
    expect(getDefaultPayrollPeriod(new Date(2026, 7, 4))).toEqual({
      year: 2026,
      month: 7,
    });
  });

  it("rolls year when January", () => {
    expect(getDefaultPayrollPeriod(new Date(2026, 0, 15))).toEqual({
      year: 2025,
      month: 12,
    });
  });
});

describe("computeMonthlyAttendanceHours", () => {
  it("uses post-leave schedule for work hours; leave from stored/snapshot (no double deduct)", () => {
    // 核准後：7/5 班表已改為剩餘下午 D；請假時數用存檔 leaveHours
    const getShiftForDate = (date: string): ShiftType => {
      if (date === "2026-07-04") return "X";
      if (date === "2026-07-01") return "A"; // holiday work
      if (date === "2026-07-05") return "D"; // remaining after morning leave
      return "X";
    };
    const getHolidayInfo = (date: string) => ({
      isHoliday: date === "2026-07-01",
    });

    const result = computeMonthlyAttendanceHours({
      employeeId: "e1",
      year: 2026,
      month: 7,
      getShiftForDate,
      getHolidayInfo,
      shiftTimeConfig,
      leaveRequests: [
        {
          employeeId: "e1",
          startDate: "2026-07-05",
          endDate: "2026-07-05",
          startTime: "08:30",
          endTime: "12:00",
          period: "morning",
          shiftMode: "schedule",
          status: "approved",
          type: "事假",
          leaveHours: 3.5,
          scheduleSnapshot: [
            { userId: "e1", date: "2026-07-05", shift: "A", hadDbEntry: true },
          ],
        },
      ],
      overtimeRequests: [
        {
          employeeId: "e1",
          date: "2026-07-05",
          startTime: "18:00",
          endTime: "20:00",
          status: "approved",
          compensationType: "pay",
        },
      ],
    });

    // 7/1 A=9（國定假加班）；7/5 剩餘 D=4.5 → work 13.5（不再扣請假）
    expect(result.holidayOvertimeHours).toBe(9);
    expect(result.workHours).toBe(13.5);
    expect(result.overtimePayHours).toBe(2);
    expect(result.leaveDeductionHours).toBe(3.5);
  });

  it("counts jiji catalog shift hours via storeConfig nominalHours", async () => {
    const { defaultStoreConfigForSite } = await import("@/lib/store-config");
    const { getHeadStoreShiftTemplate } = await import("@/lib/shift-catalog");
    const storeConfig = defaultStoreConfigForSite("jiji");
    storeConfig.shiftCatalog = getHeadStoreShiftTemplate();
    const code = storeConfig.shiftCatalog[0].code;
    const nominal = storeConfig.shiftCatalog[0].nominalHours;

    const getShiftForDate = (date: string) =>
      date === "2026-07-02" || date === "2026-07-03" ? code : "X";

    const result = computeMonthlyAttendanceHours({
      employeeId: "e1",
      year: 2026,
      month: 7,
      getShiftForDate,
      getHolidayInfo: () => ({ isHoliday: false }),
      shiftTimeConfig,
      leaveRequests: [],
      overtimeRequests: [],
      storeConfig,
    });

    expect(result.workDays).toBe(2);
    expect(result.workHours).toBe(nominal * 2);
  });
});
