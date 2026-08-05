/** 打卡地理圍籬：支援多家店座標，員工在任一點範圍內即可打卡 */

export type GeofenceLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

/** @deprecated 單店舊格式；載入時會轉成 locations[] */
export type GeofenceConfig = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

/** 預設：南投縣竹山鎮耀聖藥局（總點／本店） */
export const DEFAULT_GEOFENCE: GeofenceLocation = {
  id: "default-zhushan",
  name: "耀聖藥局（竹山）",
  address: "南投縣竹山鎮集山路三段816之5號",
  latitude: 23.7591767,
  longitude: 120.6864422,
  radiusMeters: 150,
};

function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function newLocationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 從環境變數產生預設單點（本機／Docker） */
export function geofenceFromEnv(): GeofenceLocation {
  return {
    id: "env-default",
    name: process.env.NEXT_PUBLIC_GEOFENCE_NAME?.trim() || DEFAULT_GEOFENCE.name,
    address: process.env.NEXT_PUBLIC_GEOFENCE_ADDRESS?.trim() || DEFAULT_GEOFENCE.address,
    latitude: readEnvNumber("NEXT_PUBLIC_GEOFENCE_LAT", DEFAULT_GEOFENCE.latitude),
    longitude: readEnvNumber("NEXT_PUBLIC_GEOFENCE_LNG", DEFAULT_GEOFENCE.longitude),
    radiusMeters: Math.max(
      20,
      readEnvNumber("NEXT_PUBLIC_GEOFENCE_RADIUS_M", DEFAULT_GEOFENCE.radiusMeters)
    ),
  };
}

export function defaultGeofenceLocations(): GeofenceLocation[] {
  return [geofenceFromEnv()];
}

export function normalizeGeofenceLocation(
  input: Partial<GeofenceLocation> | Partial<GeofenceConfig> | null | undefined,
  fallback: GeofenceLocation = geofenceFromEnv()
): GeofenceLocation {
  if (!input) return { ...fallback, id: fallback.id || newLocationId() };
  const latitude = Number((input as GeofenceLocation).latitude);
  const longitude = Number((input as GeofenceLocation).longitude);
  const radiusMeters = Number((input as GeofenceLocation).radiusMeters);
  const id =
    typeof (input as GeofenceLocation).id === "string" && (input as GeofenceLocation).id.trim()
      ? (input as GeofenceLocation).id.trim()
      : newLocationId();
  return {
    id,
    name: (input.name?.trim() || fallback.name).slice(0, 80),
    address: (input.address?.trim() || fallback.address).slice(0, 200),
    latitude: Number.isFinite(latitude) ? latitude : fallback.latitude,
    longitude: Number.isFinite(longitude) ? longitude : fallback.longitude,
    radiusMeters:
      Number.isFinite(radiusMeters) && radiusMeters >= 20
        ? Math.min(2000, Math.round(radiusMeters))
        : fallback.radiusMeters,
  };
}

/** 相容舊單店設定與新多店列表 */
export function parseGeofenceSettings(value: unknown): GeofenceLocation[] {
  const fallback = defaultGeofenceLocations();
  if (!value || typeof value !== "object") return fallback;

  const obj = value as Record<string, unknown>;

  if (Array.isArray(obj.locations)) {
    const list = obj.locations
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizeGeofenceLocation(item as Partial<GeofenceLocation>, fallback[0]));
    return list.length > 0 ? list : fallback;
  }

  // 舊格式：單一物件
  if ("latitude" in obj || "longitude" in obj || "name" in obj) {
    return [normalizeGeofenceLocation(obj as Partial<GeofenceConfig>, fallback[0])];
  }

  return fallback;
}

/** @deprecated 請用 normalizeGeofenceLocation */
export function normalizeGeofence(
  input: Partial<GeofenceConfig> | null | undefined
): GeofenceConfig {
  const loc = normalizeGeofenceLocation(input);
  return {
    name: loc.name,
    address: loc.address,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radiusMeters: loc.radiusMeters,
  };
}

/** @deprecated */
export const PHARMACY_LOCATION = geofenceFromEnv();

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinGeofence(
  latitude: number,
  longitude: number,
  config: GeofenceLocation | GeofenceConfig
): boolean {
  return (
    distanceMeters(latitude, longitude, config.latitude, config.longitude) <=
    config.radiusMeters
  );
}

export type GeofenceMatch = {
  location: GeofenceLocation;
  distanceMeters: number;
};

/** 找出距離最近的店點（不論是否在圍籬內） */
export function nearestGeofence(
  latitude: number,
  longitude: number,
  locations: GeofenceLocation[]
): GeofenceMatch | null {
  if (!locations.length) return null;
  let best: GeofenceMatch | null = null;
  for (const location of locations) {
    const dist = distanceMeters(latitude, longitude, location.latitude, location.longitude);
    if (!best || dist < best.distanceMeters) {
      best = { location, distanceMeters: dist };
    }
  }
  return best;
}

/** 是否在任一店點圍籬內；若是，回傳該店（取距離最近且在範圍內者） */
export function findMatchingGeofence(
  latitude: number,
  longitude: number,
  locations: GeofenceLocation[]
): GeofenceMatch | null {
  const inside = locations
    .map((location) => ({
      location,
      distanceMeters: distanceMeters(latitude, longitude, location.latitude, location.longitude),
    }))
    .filter((m) => m.distanceMeters <= m.location.radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  return inside[0] ?? null;
}

export function isWithinAnyGeofence(
  latitude: number,
  longitude: number,
  locations: GeofenceLocation[]
): boolean {
  return Boolean(findMatchingGeofence(latitude, longitude, locations));
}

/** @deprecated */
export function isWithinPharmacyGeofence(latitude: number, longitude: number): boolean {
  return isWithinAnyGeofence(latitude, longitude, defaultGeofenceLocations());
}

export function createEmptyGeofenceDraft(from?: Partial<GeofenceLocation>): GeofenceLocation {
  return normalizeGeofenceLocation({
    id: newLocationId(),
    name: from?.name ?? "新店點",
    address: from?.address ?? "",
    latitude: from?.latitude,
    longitude: from?.longitude,
    radiusMeters: from?.radiusMeters ?? 150,
  });
}
