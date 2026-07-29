import { describe, expect, it } from "vitest";
import {
  buildEffectiveTardinessRecords,
  inferScheduledTimeFromPunch,
  isCoveredByApprovedLeave,
  type LeaveRequestForTardiness,
} from "@/lib/tardiness";

describe("inferScheduledTimeFromPunch", () => {
  it("由打卡時間反推預定上班時刻", () => {
    expect(inferScheduledTimeFromPunch("09:00", 30)).toBe("08:30");
    expect(inferScheduledTimeFromPunch("14:10", 40)).toBe("13:30");
  });
});

describe("isCoveredByApprovedLeave", () => {
  const fullDayLeave: LeaveRequestForTardiness = {
    employeeId: "emp-1",
    startDate: "2026-07-20",
    endDate: "2026-07-20",
    status: "approved",
    period: "full_day",
    startTime: "08:30",
    endTime: "18:00",
  };

  const morningLeave: LeaveRequestForTardiness = {
    ...fullDayLeave,
    period: "morning",
    startTime: "08:30",
    endTime: "12:00",
  };

  it("全日核准請假覆蓋整天", () => {
    expect(isCoveredByApprovedLeave("emp-1", "2026-07-20", [fullDayLeave])).toBe(true);
    expect(isCoveredByApprovedLeave("emp-1", "2026-07-21", [fullDayLeave])).toBe(false);
    expect(isCoveredByApprovedLeave("emp-2", "2026-07-20", [fullDayLeave])).toBe(false);
  });

  it("未核准請假不覆蓋", () => {
    expect(
      isCoveredByApprovedLeave("emp-1", "2026-07-20", [
        { ...fullDayLeave, status: "pending" },
      ])
    ).toBe(false);
  });

  it("上午請假覆蓋上午上班時刻", () => {
    expect(
      isCoveredByApprovedLeave("emp-1", "2026-07-20", [morningLeave], "08:30")
    ).toBe(true);
    expect(
      isCoveredByApprovedLeave("emp-1", "2026-07-20", [morningLeave], "13:30")
    ).toBe(false);
  });
});

describe("buildEffectiveTardinessRecords", () => {
  const punch = {
    id: "p1",
    employeeId: "emp-1",
    employeeName: "測試",
    date: "2026-07-20",
    action: "work_in" as const,
    segmentIndex: 0,
    time: "09:00",
    shift: "B" as const,
    lateMinutes: 30,
    reason: "遲到",
    latitude: 0,
    longitude: 0,
    createdAt: "2026-07-20T09:00:00Z",
  };

  const tardiness = {
    id: "t1",
    employeeId: "emp-1",
    employeeName: "測試",
    date: "2026-07-20",
    minutes: 30,
    notes: "遲到",
    createdAt: "2026-07-20T09:00:00Z",
  };

  it("無請假／加班時顯示遲到", () => {
    const records = buildEffectiveTardinessRecords([tardiness], [punch], [], []);
    expect(records).toHaveLength(1);
    expect(records[0].minutes).toBe(30);
  });

  it("全日請假核准後不計遲到", () => {
    const leave: LeaveRequestForTardiness = {
      employeeId: "emp-1",
      startDate: "2026-07-20",
      endDate: "2026-07-20",
      status: "approved",
      period: "full_day",
      startTime: "08:30",
      endTime: "18:00",
    };
    const records = buildEffectiveTardinessRecords([tardiness], [punch], [], [leave]);
    expect(records).toHaveLength(0);
  });

  it("上午請假核准後不計上午遲到", () => {
    const leave: LeaveRequestForTardiness = {
      employeeId: "emp-1",
      startDate: "2026-07-20",
      endDate: "2026-07-20",
      status: "approved",
      period: "morning",
      startTime: "08:30",
      endTime: "12:00",
    };
    const records = buildEffectiveTardinessRecords([tardiness], [punch], [], [leave]);
    expect(records).toHaveLength(0);
  });

  it("上午請假不影響下午遲到", () => {
    const leave: LeaveRequestForTardiness = {
      employeeId: "emp-1",
      startDate: "2026-07-20",
      endDate: "2026-07-20",
      status: "approved",
      period: "morning",
      startTime: "08:30",
      endTime: "12:00",
    };
    const afternoonPunch = {
      ...punch,
      id: "p2",
      time: "14:10",
      lateMinutes: 40,
      segmentIndex: 1,
    };
    const records = buildEffectiveTardinessRecords([], [afternoonPunch], [], [leave]);
    expect(records).toHaveLength(1);
    expect(records[0].minutes).toBe(40);
  });

  it("核准加班後不計遲到", () => {
    const overtime = {
      id: "ot1",
      employeeId: "emp-1",
      employeeName: "測試",
      date: "2026-07-20",
      startTime: "08:30",
      endTime: "18:00",
      reason: "加班",
      compensationType: "pay" as const,
      status: "approved" as const,
      createdAt: "2026-07-20T10:00:00Z",
    };
    const records = buildEffectiveTardinessRecords([tardiness], [punch], [overtime], []);
    expect(records).toHaveLength(0);
  });
});
