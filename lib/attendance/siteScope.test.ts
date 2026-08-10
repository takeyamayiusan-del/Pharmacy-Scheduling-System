import { describe, expect, it } from "vitest";
import { filterBySiteEmployeeIds } from "@/lib/attendance/siteScope";

describe("filterBySiteEmployeeIds", () => {
  it("keeps only rows belonging to current-site employees", () => {
    const rows = [
      { employeeId: "a", date: "2026-08-10" },
      { employeeId: "b", date: "2026-08-10" },
      { employeeId: "c", date: "2026-08-10" },
    ];
    expect(filterBySiteEmployeeIds(rows, new Set(["b", "c"]))).toEqual([
      { employeeId: "b", date: "2026-08-10" },
      { employeeId: "c", date: "2026-08-10" },
    ]);
  });

  it("returns empty when site has no employees", () => {
    expect(
      filterBySiteEmployeeIds([{ employeeId: "a", x: 1 }], new Set())
    ).toEqual([]);
  });
});
