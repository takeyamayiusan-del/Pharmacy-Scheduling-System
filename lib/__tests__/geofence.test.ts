import { describe, it, expect } from "vitest";
import {
  findMatchingGeofence,
  isWithinAnyGeofence,
  parseGeofenceSettings,
  type GeofenceLocation,
} from "@/lib/attendance/geofence";

const zhushan: GeofenceLocation = {
  id: "a",
  name: "竹山",
  address: "竹山",
  latitude: 23.7591767,
  longitude: 120.6864422,
  radiusMeters: 150,
};

const hq: GeofenceLocation = {
  id: "b",
  name: "總點",
  address: "總點",
  latitude: 23.48,
  longitude: 120.45,
  radiusMeters: 200,
};

describe("multi geofence", () => {
  it("parses legacy single object into locations[]", () => {
    const list = parseGeofenceSettings({
      name: "舊設定",
      address: "地址",
      latitude: 23.7,
      longitude: 120.6,
      radiusMeters: 100,
    });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("舊設定");
    expect(list[0].radiusMeters).toBe(100);
  });

  it("matches when inside either store", () => {
    expect(isWithinAnyGeofence(23.7591767, 120.6864422, [zhushan, hq])).toBe(true);
    expect(isWithinAnyGeofence(23.48, 120.45, [zhushan, hq])).toBe(true);
    expect(isWithinAnyGeofence(24.0, 121.0, [zhushan, hq])).toBe(false);
  });

  it("returns nearest matching store name", () => {
    const match = findMatchingGeofence(23.7591767, 120.6864422, [zhushan, hq]);
    expect(match?.location.name).toBe("竹山");
  });
});
