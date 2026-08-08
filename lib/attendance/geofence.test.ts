import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEOFENCE_JIJI,
  defaultGeofenceLocations,
  defaultGeofenceLocationsForSite,
  hasJijiGeofenceLocation,
} from "@/lib/attendance/geofence";

describe("geofence multi-site defaults", () => {
  it("zhushan default is single primary location", () => {
    const list = defaultGeofenceLocationsForSite("zhushan");
    expect(list.length).toBe(1);
    expect(hasJijiGeofenceLocation(list)).toBe(false);
  });

  it("jiji default is jiji only", () => {
    const list = defaultGeofenceLocationsForSite("jiji");
    expect(list).toHaveLength(1);
    expect(hasJijiGeofenceLocation(list)).toBe(true);
    expect(DEFAULT_GEOFENCE_JIJI.address).toContain("集集");
  });

  it("legacy defaultGeofenceLocations still returns at least one", () => {
    expect(defaultGeofenceLocations().length).toBeGreaterThanOrEqual(1);
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
