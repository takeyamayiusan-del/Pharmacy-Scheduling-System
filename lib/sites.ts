/**
 * 多分店：竹山（現況）與集集家禾（新店／可自訂班別）隔離。
 * 排班資料以「該店員工」過濾；竹山既有使用者預設 site=zhushan，行為不變。
 */

export type SiteId = "zhushan" | "jiji";

export type SiteDef = {
  id: SiteId;
  /** 短名（選單） */
  name: string;
  /** 完整顯示名 */
  displayName: string;
  /** 是否使用進階班別目錄（自訂班別／多段休息） */
  customShiftCatalog: boolean;
  /** 預設店名寫入 store_config */
  defaultStoreName: string;
};

export const SITES: Record<SiteId, SiteDef> = {
  zhushan: {
    id: "zhushan",
    name: "竹山",
    displayName: "耀聖藥局（竹山）",
    customShiftCatalog: false,
    defaultStoreName: "耀聖藥局",
  },
  jiji: {
    id: "jiji",
    name: "集集",
    displayName: "家禾藥局（集集）",
    customShiftCatalog: true,
    defaultStoreName: "家禾藥局",
  },
};

export const DEFAULT_SITE_ID: SiteId = "zhushan";

export const SITE_IDS: SiteId[] = ["zhushan", "jiji"];

export function isSiteId(v: unknown): v is SiteId {
  return v === "zhushan" || v === "jiji";
}

export function parseSiteId(v: unknown, fallback: SiteId = DEFAULT_SITE_ID): SiteId {
  return isSiteId(v) ? v : fallback;
}

/** app_settings 鍵：每店一份 store_config */
export function storeConfigSettingId(siteId: SiteId): string {
  if (siteId === "zhushan") return "store_config"; // 相容既有竹山設定
  return `store_config:${siteId}`;
}

export const ACTIVE_SITE_STORAGE_KEY = "pharmacy_active_site_id";

export function readActiveSiteFromStorage(): SiteId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SITE_STORAGE_KEY);
    return isSiteId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeActiveSiteToStorage(siteId: SiteId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_SITE_STORAGE_KEY, siteId);
  } catch {
    /* ignore */
  }
}
