import { describe, expect, it } from "vitest";
import {
  buildOriginalScheduleSnapshot,
  buildSettlementPreview,
  calculateAffectedShiftHours,
  calculateActualPunchHoursInPeriod,
  resolveShiftAfterTyphoonCutoff,
  resolveTyphoonScheduleShift,
} from "@/lib/attendance/flexibleAttendance";
import type { PunchRecord, ShiftTimeConfig } from "@/lib/context/AppContext";

const config: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

describe("flexibleAttendance", () => {
  it("calculates affected hours for from_time on A shift", () => {
    expect(calculateAffectedShiftHours("A", config, "from_time", "18:00")).toBe(2);
    expect(calculateAffectedShiftHours("B", config, "from_time", "18:00")).toBe(0);
    expect(calculateAffectedShiftHours("X", config, "from_time", "18:00")).toBe(0);
  });

  it("never includes originally-off staff in settlement actions", () => {
    const originalSchedule = buildOriginalScheduleSnapshot(
      [
        { id: "a", role: "staff" },
        { id: "b", role: "staff" },
        { id: "c", role: "staff" },
        { id: "boss", role: "owner" },
      ],
      (_date, id) => {
        if (id === "a") return "A";
        if (id === "b") return "A";
        return "X";
      },
      "2026-07-10"
    );

    const punches: PunchRecord[] = [
      {
        id: "1",
        employeeId: "a",
        employeeName: "有來",
        date: "2026-07-10",
        action: "work_in",
        segmentIndex: 2,
        time: "19:00",
        shift: "A",
        lateMinutes: 0,
        latitude: 0,
        longitude: 0,
        createdAt: "",
      },
      {
        id: "2",
        employeeId: "a",
        employeeName: "有來",
        date: "2026-07-10",
        action: "work_out",
        segmentIndex: 2,
        time: "21:00",
        shift: "A",
        lateMinutes: 0,
        latitude: 0,
        longitude: 0,
        createdAt: "",
      },
    ];

    const rows = buildSettlementPreview({
      employees: [
        { id: "a", name: "有來", role: "staff" },
        { id: "b", name: "沒來", role: "staff" },
        { id: "c", name: "休假", role: "staff" },
      ],
      originalSchedule,
      date: "2026-07-10",
      periodMode: "from_time",
      fromTime: "18:00",
      shiftTimeConfig: config,
      punchRecords: punches,
    });

    expect(rows.map((r) => r.userId).sort()).toEqual(["a", "b"]);
    expect(rows.find((r) => r.userId === "c")).toBeUndefined();
    expect(rows.find((r) => r.userId === "a")?.outcome).toBe("comp_leave_granted");
    expect(rows.find((r) => r.userId === "b")?.outcome).toBe("pending_makeup");
  });

  it("calculates punch hours overlapping typhoon window", () => {
    const punches: PunchRecord[] = [
      {
        id: "1",
        employeeId: "u1",
        employeeName: "小明",
        date: "2026-07-10",
        action: "work_in",
        segmentIndex: 2,
        time: "19:00",
        shift: "A",
        lateMinutes: 0,
        latitude: 0,
        longitude: 0,
        createdAt: "",
      },
      {
        id: "2",
        employeeId: "u1",
        employeeName: "小明",
        date: "2026-07-10",
        action: "work_out",
        segmentIndex: 2,
        time: "21:00",
        shift: "A",
        lateMinutes: 0,
        latitude: 0,
        longitude: 0,
        createdAt: "",
      },
    ];
    expect(calculateActualPunchHoursInPeriod(punches, "from_time", "18:00")).toBe(2);
  });
});

describe("typhoon schedule shift resolution", () => {
  it("19:00 停班：白班不受影響", () => {
    expect(
      resolveTyphoonScheduleShift({
        originalShift: "B",
        willAttend: false,
        periodMode: "from_time",
        fromTime: "19:00",
        shiftTimeConfig: config,
      })
    ).toBe("B");
  });

  it("19:00 停班：全天班未出席晚班 → 截成白天班（到下午）", () => {
    expect(resolveShiftAfterTyphoonCutoff("A", "19:00", config)).toBe("B");
    expect(
      resolveTyphoonScheduleShift({
        originalShift: "A",
        willAttend: false,
        periodMode: "from_time",
        fromTime: "19:00",
        shiftTimeConfig: config,
      })
    ).toBe("B");
  });

  it("19:00 停班：全天班有出席 → 維持原班", () => {
    expect(
      resolveTyphoonScheduleShift({
        originalShift: "A",
        willAttend: true,
        periodMode: "from_time",
        fromTime: "19:00",
        shiftTimeConfig: config,
      })
    ).toBe("A");
  });

  it("17:00 停班：白班未出席仍對應日間班", () => {
    expect(resolveShiftAfterTyphoonCutoff("B", "17:00", config)).toBe("B");
  });

  it("12:00 停班：白班未出席 → 只剩上午", () => {
    expect(resolveShiftAfterTyphoonCutoff("B", "12:00", config)).toBe("C");
  });

  it("全日停班：沒來 → 休假", () => {
    expect(
      resolveTyphoonScheduleShift({
        originalShift: "A",
        willAttend: false,
        periodMode: "full_day",
        shiftTimeConfig: config,
      })
    ).toBe("X");
  });

  it("全日停班：有來可選全天／半天", () => {
    expect(
      resolveTyphoonScheduleShift({
        originalShift: "A",
        willAttend: true,
        periodMode: "full_day",
        shiftTimeConfig: config,
        attendeeChoice: "keep",
      })
    ).toBe("A");
    expect(
      resolveTyphoonScheduleShift({
        originalShift: "B",
        willAttend: true,
        periodMode: "full_day",
        shiftTimeConfig: config,
        attendeeChoice: "full_day",
      })
    ).toBe("B");
    expect(
      resolveTyphoonScheduleShift({
        originalShift: "A",
        willAttend: true,
        periodMode: "full_day",
        shiftTimeConfig: config,
        attendeeChoice: "morning",
      })
    ).toBe("C");
    expect(
      resolveTyphoonScheduleShift({
        originalShift: "A",
        willAttend: true,
        periodMode: "full_day",
        shiftTimeConfig: config,
        attendeeChoice: "afternoon",
      })
    ).toBe("D");
  });
});
