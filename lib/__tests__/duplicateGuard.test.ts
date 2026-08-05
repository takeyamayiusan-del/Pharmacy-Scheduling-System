import { describe, it, expect } from "vitest";
import {
  hasDuplicateLeave,
  hasDuplicateOvertime,
  timesOverlap,
  datesOverlap,
} from "@/lib/applications/duplicateGuard";

describe("duplicateGuard", () => {
  it("detects overlapping times on same day", () => {
    expect(timesOverlap("08:30", "12:00", "11:00", "14:00")).toBe(true);
    expect(timesOverlap("08:30", "12:00", "13:30", "18:00")).toBe(false);
    expect(timesOverlap("08:30", "12:00", "12:00", "18:00")).toBe(false);
  });

  it("detects overlapping date ranges", () => {
    expect(datesOverlap("2026-03-01", "2026-03-03", "2026-03-03", "2026-03-05")).toBe(true);
    expect(datesOverlap("2026-03-01", "2026-03-02", "2026-03-03", "2026-03-05")).toBe(false);
  });

  it("flags duplicate leave when date and time overlap", () => {
    expect(
      hasDuplicateLeave(
        {
          startDate: "2026-03-10",
          endDate: "2026-03-10",
          startTime: "08:30",
          endTime: "18:00",
        },
        [
          {
            leave_date: "2026-03-10",
            end_date: "2026-03-10",
            period: "morning",
            status: "pending",
          },
        ]
      )
    ).toBe(true);
  });

  it("allows leave morning then afternoon same day", () => {
    expect(
      hasDuplicateLeave(
        {
          startDate: "2026-03-10",
          endDate: "2026-03-10",
          startTime: "13:30",
          endTime: "18:00",
        },
        [
          {
            leave_date: "2026-03-10",
            end_date: "2026-03-10",
            start_time: "08:30",
            end_time: "12:00",
            period: "morning",
            status: "approved",
          },
        ]
      )
    ).toBe(false);
  });

  it("flags overlapping overtime on same day", () => {
    expect(
      hasDuplicateOvertime(
        { date: "2026-03-10", startTime: "18:00", endTime: "20:00" },
        [
          {
            overtime_date: "2026-03-10",
            start_time: "19:00:00",
            end_time: "21:00:00",
            status: "pending",
          },
        ]
      )
    ).toBe(true);
  });

  it("allows non-overlapping overtime same day", () => {
    expect(
      hasDuplicateOvertime(
        { date: "2026-03-10", startTime: "18:00", endTime: "19:00" },
        [
          {
            overtime_date: "2026-03-10",
            start_time: "19:00",
            end_time: "21:00",
            status: "approved",
          },
        ]
      )
    ).toBe(false);
  });
});
