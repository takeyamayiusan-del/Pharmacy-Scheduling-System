import { describe, expect, it } from "vitest";
import {
  buildSwapShiftsAndChanges,
  computeSwapScheduleChanges,
  swapSnapshotCells,
} from "@/lib/schedule/swapSchedule";
import type { ScheduleSnapshotEntry } from "@/lib/schedule/scheduleSnapshot";

describe("computeSwapScheduleChanges", () => {
  const base = {
    requesterId: "user-a",
    targetEmployeeId: "user-b",
    requesterDate: "2026-07-09",
    targetDate: "2026-07-10",
  };

  it("他人跨日換班：兩人在兩日出勤整段對調（真正互換）", () => {
    // A@09=A, A@10=X, B@09=X, B@10=B
    expect(computeSwapScheduleChanges(base, "A", "B", "X", "X")).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "X" },
      { userId: "user-a", date: "2026-07-10", shift: "B" },
      { userId: "user-b", date: "2026-07-10", shift: "X" },
      { userId: "user-b", date: "2026-07-09", shift: "A" },
    ]);
  });

  it("他人同日換班：兩人當天班別互換", () => {
    const sameDay = { ...base, targetDate: "2026-07-09" };
    expect(computeSwapScheduleChanges(sameDay, "A", "B", "A", "B")).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "B" },
      { userId: "user-b", date: "2026-07-09", shift: "A" },
    ]);
  });

  it("自行換班：兩日班別互換", () => {
    expect(
      computeSwapScheduleChanges(
        { ...base, targetEmployeeId: "user-a" },
        "A",
        "B",
        "B",
        "A"
      )
    ).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "B" },
      { userId: "user-a", date: "2026-07-10", shift: "A" },
    ]);
  });

  it("休班也可對換", () => {
    expect(computeSwapScheduleChanges(base, "X", "B", "A", "C")).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "C" },
      { userId: "user-a", date: "2026-07-10", shift: "B" },
      { userId: "user-b", date: "2026-07-10", shift: "A" },
      { userId: "user-b", date: "2026-07-09", shift: "X" },
    ]);
  });
});

describe("swapSnapshotCells", () => {
  it("他人跨日需快照 4 格", () => {
    expect(
      swapSnapshotCells(
        {
          requesterId: "a",
          targetEmployeeId: "b",
          requesterDate: "2026-07-09",
          targetDate: "2026-07-10",
        },
        false
      )
    ).toHaveLength(4);
  });

  it("他人同日去重為 2 格", () => {
    expect(
      swapSnapshotCells(
        {
          requesterId: "a",
          targetEmployeeId: "b",
          requesterDate: "2026-07-09",
          targetDate: "2026-07-09",
        },
        false
      )
    ).toHaveLength(2);
  });
});

describe("buildSwapShiftsAndChanges", () => {
  it("依快照產生他人跨日 4 格變更", () => {
    const snapshot: ScheduleSnapshotEntry[] = [
      { userId: "user-a", date: "2026-07-09", shift: "A", hadDbEntry: true },
      { userId: "user-a", date: "2026-07-10", shift: "X", hadDbEntry: true },
      { userId: "user-b", date: "2026-07-09", shift: "X", hadDbEntry: true },
      { userId: "user-b", date: "2026-07-10", shift: "B", hadDbEntry: true },
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

    expect(result.changes).toEqual([
      { userId: "user-a", date: "2026-07-09", shift: "X" },
      { userId: "user-a", date: "2026-07-10", shift: "B" },
      { userId: "user-b", date: "2026-07-10", shift: "X" },
      { userId: "user-b", date: "2026-07-09", shift: "A" },
    ]);
  });

  it("同日他人換班產生 2 格互換", () => {
    const snapshot: ScheduleSnapshotEntry[] = [
      { userId: "user-a", date: "2026-07-13", shift: "A", hadDbEntry: true },
      { userId: "user-b", date: "2026-07-13", shift: "B", hadDbEntry: true },
    ];

    const result = buildSwapShiftsAndChanges(
      {
        requesterId: "user-a",
        targetEmployeeId: "user-b",
        requesterDate: "2026-07-13",
        targetDate: "2026-07-13",
      },
      snapshot
    );

    expect(result.changes).toEqual([
      { userId: "user-a", date: "2026-07-13", shift: "B" },
      { userId: "user-b", date: "2026-07-13", shift: "A" },
    ]);
  });
});
