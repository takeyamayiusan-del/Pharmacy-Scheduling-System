import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEOFENCE_JIJI,
  defaultGeofenceLocations,
  hasJijiGeofenceLocation,
} from "@/lib/attendance/geofence";

describe("geofence multi-site defaults", () => {
  it("defaults include jiji location", () => {
    const list = defaultGeofenceLocations();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(hasJijiGeofenceLocation(list)).toBe(true);
    expect(DEFAULT_GEOFENCE_JIJI.address).toContain("集集");
  });

  it("detects jiji by name", () => {
    expect(
      hasJijiGeofenceLocation([
        {
          id: "x",
          name: "家禾藥局",
          address: "某處",
          latitude: 1,
          longitude: 2,
          radiusMeters: 100,
        },
      ])
    ).toBe(true);
  });
});
