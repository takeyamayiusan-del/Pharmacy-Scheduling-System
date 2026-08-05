/** 打卡地理圍籬設定（單店座標；多店別之後再做） */

export type GeofenceConfig = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

/** 預設：南投縣竹山鎮耀聖藥局 */
export const DEFAULT_GEOFENCE: GeofenceConfig = {
  name: "耀聖藥局",
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

/** 從環境變數覆寫預設座標（本機／Docker 部署用） */
export function geofenceFromEnv(): GeofenceConfig {
  return {
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

export function normalizeGeofence(input: Partial<GeofenceConfig> | null | undefined): GeofenceConfig {
  const base = geofenceFromEnv();
  if (!input) return base;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const radiusMeters = Number(input.radiusMeters);
  return {
    name: (input.name?.trim() || base.name).slice(0, 80),
    address: (input.address?.trim() || base.address).slice(0, 200),
    latitude: Number.isFinite(latitude) ? latitude : base.latitude,
    longitude: Number.isFinite(longitude) ? longitude : base.longitude,
    radiusMeters:
      Number.isFinite(radiusMeters) && radiusMeters >= 20
        ? Math.min(2000, Math.round(radiusMeters))
        : base.radiusMeters,
  };
}

/** @deprecated 使用 getGeofenceConfig／AppContext.geofenceConfig */
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
  config: GeofenceConfig = geofenceFromEnv()
): boolean {
  return (
    distanceMeters(latitude, longitude, config.latitude, config.longitude) <=
    config.radiusMeters
  );
}

/** @deprecated 改用 isWithinGeofence(lat, lng, config) */
export function isWithinPharmacyGeofence(latitude: number, longitude: number): boolean {
  return isWithinGeofence(latitude, longitude);
}
