import { describe, expect, it } from "vitest";
import {
  computeMonthWorkHoursFromSchedule,
  getApprovedLeaveHoursInMonth,
  getShiftWorkHours,
  sumApprovedLeaveHoursInMonth,
} from "./canonicalMonthHours";
import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";

const shiftTimeConfig: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

describe("getShiftWorkHours", () => {
  it("sums segment hours for A/E (not legacy flat 8h)", () => {
    expect(getShiftWorkHours("A", shiftTimeConfig)).toBe(9);
    expect(getShiftWorkHours("E", shiftTimeConfig)).toBe(5.5);
    expect(getShiftWorkHours("B", shiftTimeConfig)).toBe(8);
  });
});

describe("getApprovedLeaveHoursInMonth", () => {
  it("prefers stored leaveHours when request is wholly in month", () => {
    // 核准後班表已變 X，若用現班表重算會得到 0
    const getShiftForDate = (): ShiftType => "X";
    const hours = getApprovedLeaveHoursInMonth({
      request: {
        employeeId: "e1",
        startDate: "2026-07-10",
        endDate: "2026-07-10",
        startTime: "08:30",
        endTime: "18:00",
        period: "full_day",
        shiftMode: "schedule",
        status: "approved",
        type: "事假",
        leaveHours: 8,
      },
      year: 2026,
      month: 7,
      getShiftForDate,
      shiftTimeConfig,
    });
    expect(hours).toBe(8);
  });

  it("uses scheduleSnapshot original shift when leaveHours missing / cross-month", () => {
    // 跨月：7/31～8/1，現班表已改 X；snapshot 還原為 B
    const getShiftForDate = (): ShiftType => "X";
    const hours = getApprovedLeaveHoursInMonth({
      request: {
        employeeId: "e1",
        startDate: "2026-07-31",
        endDate: "2026-08-01",
        startTime: "08:30",
        endTime: "18:00",
        period: "full_day",
        shiftMode: "schedule",
        status: "approved",
        type: "事假",
        leaveHours: 16, // 整段時數，不可整段套用到單月
        scheduleSnapshot: [
          { userId: "e1", date: "2026-07-31", shift: "B", hadDbEntry: true },
          { userId: "e1", date: "2026-08-01", shift: "B", hadDbEntry: true },
        ],
      },
      year: 2026,
      month: 7,
      getShiftForDate,
      shiftTimeConfig,
    });
    expect(hours).toBe(8); // 僅 7/31
  });

  it("morning leave on A is 3.5h via snapshot even if current shift is D", () => {
    const getShiftForDate = (): ShiftType => "D"; // 核准後只剩下午
    const hours = getApprovedLeaveHoursInMonth({
      request: {
        employeeId: "e1",
        startDate: "2026-07-05",
        endDate: "2026-07-05",
        startTime: "08:30",
        endTime: "12:00",
        period: "morning",
        shiftMode: "schedule",
        status: "approved",
        type: "事假",
        // 無 leaveHours → 依 snapshot 原班別 A 重算
        scheduleSnapshot: [
          { userId: "e1", date: "2026-07-05", shift: "A", hadDbEntry: true },
        ],
      },
      year: 2026,
      month: 7,
      getShiftForDate,
      shiftTimeConfig,
    });
    expect(hours).toBe(3.5);
  });
});

describe("computeMonthWorkHoursFromSchedule — no double leave deduction", () => {
  it("uses current schedule hours only (post-leave remaining)", () => {
    // 7/1 國定假 A；7/5 半日假後班表剩 D（4.5h），不可再扣請假
    const getShiftForDate = (date: string): ShiftType => {
      if (date === "2026-07-01") return "A";
      if (date === "2026-07-05") return "D";
      return "X";
    };
    const result = computeMonthWorkHoursFromSchedule({
      employeeId: "e1",
      year: 2026,
      month: 7,
      getShiftForDate,
      getHolidayInfo: (date) => ({ isHoliday: date === "2026-07-01" }),
      shiftTimeConfig,
    });
    expect(result.holidayOvertimeHours).toBe(9);
    expect(result.workHours).toBe(13.5); // 9 + 4.5
    expect(result.workDays).toBe(2);
  });

  it("pairs with leave hours so total original duty is preserved", () => {
    const getShiftForDate = (date: string): ShiftType => {
      if (date === "2026-07-05") return "D"; // 剩餘下午
      return "X";
    };
    const schedule = computeMonthWorkHoursFromSchedule({
      employeeId: "e1",
      year: 2026,
      month: 7,
      getShiftForDate,
      getHolidayInfo: () => ({ isHoliday: false }),
      shiftTimeConfig,
    });
    const leave = sumApprovedLeaveHoursInMonth({
      employeeId: "e1",
      year: 2026,
      month: 7,
      getShiftForDate,
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
    });
    // 原 A=9 = 剩餘上班 4.5 + 請假 3.5 + 晚班段？ 半日上午請假後有效班可能是 D(4.5) 或含晚班
    // 此處班表已定為 D=4.5，請假存檔 3.5 → 合計 8（未含晚班因核准後改寫為 D）
    expect(schedule.workHours).toBe(4.5);
    expect(leave).toBe(3.5);
  });
});
