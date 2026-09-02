import { describe, expect, it } from "vitest";
import {
  buildRestDaySegments,
  getRestDayPunchState,
  isRestDayOvertimePunch,
} from "@/lib/attendance/restDayPunch";

const base = {
  id: "1",
  employeeId: "u1",
  employeeName: "測試",
  date: "2026-09-02",
  shift: "X" as const,
  lateMinutes: 0,
  reason: "無班表打卡",
  latitude: 0,
  longitude: 0,
  createdAt: "",
};

describe("restDayPunch", () => {
  it("detects rest-day overtime punches", () => {
    expect(isRestDayOvertimePunch({ shift: "X", reason: "" })).toBe(true);
    expect(isRestDayOvertimePunch({ shift: "B", reason: "無班表打卡" })).toBe(true);
    expect(isRestDayOvertimePunch({ shift: "B", reason: "一般" })).toBe(false);
  });

  it("groups punches by segment", () => {
    const segments = buildRestDaySegments([
      { ...base, id: "a", action: "work_in", segmentIndex: 0, time: "09:00" },
      { ...base, id: "b", action: "work_out", segmentIndex: 0, time: "12:00" },
      { ...base, id: "c", action: "work_in", segmentIndex: 1, time: "14:00" },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[1]?.workIn?.time).toBe("14:00");
    expect(segments[1]?.workOut).toBeNull();
  });

  it("allows new work_in after a segment is complete", () => {
    const state = getRestDayPunchState([
      { ...base, id: "a", action: "work_in", segmentIndex: 0, time: "09:00" },
      { ...base, id: "b", action: "work_out", segmentIndex: 0, time: "12:00" },
    ]);
    expect(state.canWorkIn).toBe(true);
    expect(state.canWorkOut).toBe(false);
    expect(state.nextWorkInSegmentIndex).toBe(1);
  });

  it("blocks work_in while a segment is open", () => {
    const state = getRestDayPunchState([
      { ...base, id: "a", action: "work_in", segmentIndex: 1, time: "14:00" },
    ]);
    expect(state.canWorkIn).toBe(false);
    expect(state.canWorkOut).toBe(true);
    expect(state.workOutSegmentIndex).toBe(1);
  });
});
