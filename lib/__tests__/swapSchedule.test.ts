import { describe, expect, it } from "vitest";
import {
  buildSwapShiftsAndChanges,
  computeSwapScheduleChanges,
} from "@/lib/schedule/swapSchedule";
import type { ScheduleSnapshotEntry } from "@/lib/schedule/scheduleSnapshot";

describe("computeSwapScheduleChanges", () => {
  const base = {
    requesterId: "user-a",
    targetEmployeeId: "user-b",
    requesterDate: "2026-07-09",
    targetDate: "2026-07-10",
  };

  it("他人換班：兩人在各自換班日互換班別", () => {
    expect(computeSwapScheduleChanges(base, "A", "B")).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "B" },
      { userId: "user-b", date: "2026-07-10", shift: "A" },
    ]);
  });

  it("自行換班：兩日班別互換", () => {
    expect(
      computeSwapScheduleChanges(
        { ...base, targetEmployeeId: "user-a" },
        "A",
        "B"
      )
    ).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "B" },
      { userId: "user-a", date: "2026-07-10", shift: "A" },
    ]);
  });

  it("休班也可對換", () => {
    expect(computeSwapScheduleChanges(base, "X", "B")).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "B" },
      { userId: "user-b", date: "2026-07-10", shift: "X" },
    ]);
  });
});

describe("buildSwapShiftsAndChanges", () => {
  it("依快照產生兩格變更", () => {
    const snapshot: ScheduleSnapshotEntry[] = [
      { userId: "user-a", date: "2026-07-09", shift: "A", hadDbEntry: false },
      { userId: "user-b", date: "2026-07-10", shift: "B", hadDbEntry: false },
    ];

    const result = buildSwapShiftsAndChanges(
      {
        requesterId: "user-a",
        targetEmployeeId: "user-b",
        requesterDate: "2026-07-09",
        targetDate: "2026-07-10",
      },
      snapshot
    );

    expect(result.changes).toHaveLength(2);
    expect(result.changes).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "B" },
      { userId: "user-b", date: "2026-07-10", shift: "A" },
    ]);
  });
});
