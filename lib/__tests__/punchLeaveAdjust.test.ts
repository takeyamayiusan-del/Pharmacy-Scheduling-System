import { describe, expect, it } from "vitest";
import type { ShiftTimeConfig } from "@/lib/context/AppContext";
import {
  filterPunchSlotsForApprovedLeave,
  resolveLateAfterLeaveApproval,
  resolvePunchLateMinutes,
} from "@/lib/attendance/punchLeaveAdjust";
import { getPunchSlotsForShift, timeToMinutes } from "@/lib/attendance/punchSchedule";

const shiftTimeConfig: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

describe("resolvePunchLateMinutes", () => {
  it("已核准上午假覆蓋上午上班則不計遲到", () => {
    const late = resolvePunchLateMinutes({
      employeeId: "e1",
      date: "2026-08-04",
      scheduledTime: "08:30",
      actualMinutes: timeToMinutes("13:40"),
      leaveRequests: [
        {
          employeeId: "e1",
          startDate: "2026-08-04",
          endDate: "2026-08-04",
          status: "approved",
          period: "morning",
          startTime: "08:30",
          endTime: "12:00",
        },
      ],
    });
    expect(late).toBe(0);
  });

  it("尚未核准則仍計遲到", () => {
    const late = resolvePunchLateMinutes({
      employeeId: "e1",
      date: "2026-08-04",
      scheduledTime: "08:30",
      actualMinutes: timeToMinutes("09:00"),
      leaveRequests: [
        {
          employeeId: "e1",
          startDate: "2026-08-04",
          endDate: "2026-08-04",
          status: "pending",
          period: "morning",
          startTime: "08:30",
          endTime: "12:00",
        },
      ],
    });
    expect(late).toBeGreaterThan(0);
  });
});

describe("filterPunchSlotsForApprovedLeave", () => {
  it("上午假核准後隱藏上午上下班格", () => {
    const slots = getPunchSlotsForShift("B", shiftTimeConfig);
    const filtered = filterPunchSlotsForApprovedLeave(
      slots,
      "e1",
      "2026-08-04",
      [
        {
          employeeId: "e1",
          startDate: "2026-08-04",
          endDate: "2026-08-04",
          status: "approved",
          period: "morning",
          startTime: "08:30",
          endTime: "12:00",
        },
      ]
    );
    expect(filtered.every((s) => timeToMinutes(s.scheduledTime) >= timeToMinutes("13:30"))).toBe(
      true
    );
  });
});

describe("resolveLateAfterLeaveApproval", () => {
  it("上午假核准後清除對上午格的遲到", () => {
    const decision = resolveLateAfterLeaveApproval({
      period: "morning",
      leaveStartTime: "08:30",
      leaveEndTime: "12:00",
      punchShift: "B",
      segmentIndex: 0,
      punchTime: "13:40",
      originalShift: "B",
      shiftTimeConfig,
    });
    expect(decision.clear).toBe(true);
    expect(decision.lateMinutes).toBe(0);
  });

  it("下午假核准不清除上午遲到", () => {
    const decision = resolveLateAfterLeaveApproval({
      period: "afternoon",
      leaveStartTime: "13:30",
      leaveEndTime: "18:00",
      punchShift: "B",
      segmentIndex: 0,
      punchTime: "09:00",
      originalShift: "B",
      shiftTimeConfig,
    });
    expect(decision.clear).toBe(false);
  });

  it("全日假一律清除", () => {
    const decision = resolveLateAfterLeaveApproval({
      period: "full_day",
      leaveStartTime: "08:30",
      leaveEndTime: "18:00",
      punchShift: "B",
      segmentIndex: 0,
      punchTime: "09:00",
      originalShift: "B",
      shiftTimeConfig,
    });
    expect(decision).toEqual({ clear: true, lateMinutes: 0 });
  });
});
