import { describe, expect, it } from "vitest";
import { enumerateDatesInRange } from "@/lib/schedule/effectiveShift";

describe("enumerateDatesInRange", () => {
  it("keeps a single-day range on that calendar day", () => {
    expect(enumerateDatesInRange("2026-08-15", "2026-08-15")).toEqual(["2026-08-15"]);
  });

  it("accepts ISO timestamps without shifting the first day", () => {
    expect(enumerateDatesInRange("2026-08-15T00:00:00.000Z", "2026-08-15T00:00:00.000Z")).toEqual([
      "2026-08-15",
    ]);
  });

  it("walks local calendar days across a month boundary", () => {
    expect(enumerateDatesInRange("2026-08-31", "2026-09-01")).toEqual([
      "2026-08-31",
      "2026-09-01",
    ]);
  });
});
