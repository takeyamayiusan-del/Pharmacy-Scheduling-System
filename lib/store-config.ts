/**
 * 店家設定（site / store config）
 * 竹山：app_settings.id = "store_config"（相容舊資料）
 * 其他店：app_settings.id = "store_config:<siteId>"
 */

import { getLocalDayOfWeek } from "@/lib/schedule/sundayRest";
import {
  getHeadStoreShiftTemplate,
  parseCatalogShifts,
  type CatalogShift,
} from "@/lib/shift-catalog";
import { SITES, type SiteId } from "@/lib/sites";

export type StoreShiftCode = "A" | "B" | "C" | "D" | "E" | "X";

export const ALL_SHIFT_CODES: StoreShiftCode[] = ["A", "B", "C", "D", "E", "X"];

export type StoreShiftDef = {
  code: StoreShiftCode;
  /** 班別名稱，例如「全天」「白班」 */
  name: string;
  enabled: boolean;
};

/** 員工可勾選的規則標籤（店層功能開啟後才顯示） */
export type StoreRuleTagId = "rotation_evening" | "weekday_off";

export type StoreRuleTag = {
  id: StoreRuleTagId;
  /** 表頭／標籤文字（可依店改，例如「週四晚班輪值」） */
  label: string;
  description: string;
};

export type RotationEveningConfig = {
  /** 可複選：0=日 … 6=六；預設禮拜三 */
  weekdays: number[];
  /** 值晚班班別（預設 A） */
  onDutyShift: StoreShiftCode;
  /** 不值晚班時的班別（預設 B） */
  offDutyShift: StoreShiftCode;
  /**
   * 每月可選「不輪晚班」上限。
   * null = 自動 ceil(該月輪值日數 / 2)
   */
  monthlyOffLimit: number | null;
  /** 側欄／選單名稱，例如「禮三晚班」「週四晚班」 */
  menuLabel: string;
};

export type StoreConfig = {
  version: 1;
  /** 店名（顯示用） */
  storeName: string;
  /** 所屬店（寫入時帶上，方便除錯） */
  siteId?: SiteId;
  shifts: StoreShiftDef[];
  /** 平日（非輪值日、非固定班）預設班；集集可為目錄短碼 */
  defaultWeekdayShift: string;
  /** 週六未設固定班時的預設班；集集可為目錄短碼 */
  defaultSaturdayShift: string;
  features: {
    /** 週期輪班（原「禮三晚班」） */
    rotationEvening: boolean;
    /** 平日不排休規則 */
    weekdayOffRule: boolean;
    /**
     * 進階班別目錄（自訂名稱／多段休息）。
     * 竹山預設 false，排班維持 A–E；集集預設 true。
     */
    customShiftCatalog: boolean;
  };
  rotationEvening: RotationEveningConfig;
  /** 規則標籤文案（勾選欄位用，非功能開關） */
  ruleTags: StoreRuleTag[];
  /** 進階班別目錄（僅 customShiftCatalog 開啟時使用） */
  shiftCatalog: CatalogShift[];
};

export const STORE_CONFIG_SETTING_ID = "store_config";

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

const DEFAULT_SHIFTS: StoreShiftDef[] = [
  { code: "A", name: "全天", enabled: true },
  { code: "B", name: "白班", enabled: true },
  { code: "C", name: "上午", enabled: true },
  { code: "D", name: "下午", enabled: true },
  { code: "E", name: "下午+晚", enabled: true },
  { code: "X", name: "休假", enabled: true },
];

const DEFAULT_RULE_TAGS: StoreRuleTag[] = [
  {
    id: "rotation_evening",
    label: "輪值晚班",
    description: "依選休輪流上晚班／全天班",
  },
  {
    id: "weekday_off",
    label: "平日不排休",
    description: "平日正常上班，排休只能選週六",
  },
];

/** 竹山現況預設（禮三晚班等）— 排班行為不變 */
export function defaultStoreConfig(): StoreConfig {
  return defaultStoreConfigForSite("zhushan");
}

/** 依店別預設；集集開啟進階班別目錄且關閉竹山禮三規則 */
export function defaultStoreConfigForSite(siteId: SiteId): StoreConfig {
  const site = SITES[siteId];
  const isZhushan = siteId === "zhushan";
  return {
    version: 1,
    storeName: site.defaultStoreName,
    siteId,
    shifts: DEFAULT_SHIFTS.map((s) => ({ ...s })),
    defaultWeekdayShift: "B",
    defaultSaturdayShift: "C",
    features: {
      rotationEvening: isZhushan,
      weekdayOffRule: isZhushan,
      customShiftCatalog: site.customShiftCatalog,
    },
    rotationEvening: {
      weekdays: [3],
      onDutyShift: "A",
      offDutyShift: "B",
      monthlyOffLimit: null,
      menuLabel: "禮三晚班",
    },
    ruleTags: DEFAULT_RULE_TAGS.map((t) => ({ ...t })),
    shiftCatalog: [],
  };
}

/**
 * 集集開店用：總店班別範本 + 合理預設班。
 * 僅供首次落地／seed；不會覆寫竹山設定。
 */
export function buildJijiStoreConfigWithTemplate(): StoreConfig {
  const base = defaultStoreConfigForSite("jiji");
  const catalog = getHeadStoreShiftTemplate();
  const pick = (...codes: string[]) =>
    codes.find((code) => catalog.some((s) => s.code === code && s.enabled)) ??
    catalog.find((s) => s.enabled && s.category !== "off")?.code ??
    base.defaultWeekdayShift;

  return {
    ...base,
    shiftCatalog: catalog,
    defaultWeekdayShift: pick("白班5", "白班4", "白班1"),
    defaultSaturdayShift: pick("白班2", "白班1", "白班3"),
  };
}

/** 是否需要為集集寫入範本（無列／目錄仍空） */
export function shouldSeedJijiShiftCatalog(config: StoreConfig | null | undefined): boolean {
  if (!config) return true;
  if (!config.features.customShiftCatalog) return false;
  return !Array.isArray(config.shiftCatalog) || config.shiftCatalog.length === 0;
}

function isShiftCode(v: unknown): v is StoreShiftCode {
  return typeof v === "string" && (ALL_SHIFT_CODES as string[]).includes(v);
}

/** 預設班碼：竹山僅 A–X；集集可為目錄碼（相容暫存的 A–E） */
function resolveDefaultShiftCode(
  raw: unknown,
  fallback: string,
  opts: { customShiftCatalog: boolean; shiftCatalog: CatalogShift[] }
): string {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  const code = raw.trim().slice(0, 24);
  if (isShiftCode(code)) return code;
  if (opts.customShiftCatalog) {
    if (opts.shiftCatalog.some((s) => s.code === code)) return code;
  }
  return fallback;
}

function normalizeWeekdays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [3];
  const set = new Set<number>();
  for (const item of raw) {
    const n = Number(item);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  const list = Array.from(set).sort((a, b) => a - b);
  return list.length > 0 ? list : [3];
}

function normalizeShifts(raw: unknown): StoreShiftDef[] {
  const byCode = new Map<StoreShiftCode, StoreShiftDef>();
  for (const d of DEFAULT_SHIFTS) byCode.set(d.code, { ...d });

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (!isShiftCode(row.code)) continue;
      const prev = byCode.get(row.code)!;
      byCode.set(row.code, {
        code: row.code,
        name:
          typeof row.name === "string" && row.name.trim()
            ? row.name.trim()
            : prev.name,
        enabled: typeof row.enabled === "boolean" ? row.enabled : prev.enabled,
      });
    }
  }

  // 至少保留休假與一個上班班別
  const list = ALL_SHIFT_CODES.map((c) => byCode.get(c)!);
  if (!list.some((s) => s.enabled && s.code !== "X")) {
    const b = list.find((s) => s.code === "B");
    if (b) b.enabled = true;
  }
  const x = list.find((s) => s.code === "X");
  if (x) x.enabled = true;
  return list;
}

function normalizeRuleTags(raw: unknown, menuLabel: string): StoreRuleTag[] {
  const base = DEFAULT_RULE_TAGS.map((t) => ({ ...t }));
  const rot = base.find((t) => t.id === "rotation_evening");
  if (rot) {
    rot.label = menuLabel === "禮三晚班" ? "禮拜三晚班輪值" : `${menuLabel}輪值`;
    rot.description =
      menuLabel === "禮三晚班"
        ? "週三依選休輪流上 A/B 班"
        : "依選休輪流上晚班／全天班";
  }

  if (!Array.isArray(raw)) return base;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = row.id;
    if (id !== "rotation_evening" && id !== "weekday_off") continue;
    const target = base.find((t) => t.id === id)!;
    if (typeof row.label === "string" && row.label.trim()) {
      target.label = row.label.trim();
    }
    if (typeof row.description === "string" && row.description.trim()) {
      target.description = row.description.trim();
    }
  }
  return base;
}

/** 解析 DB／表單值；缺欄位時補預設（可指定店別預設） */
export function parseStoreConfig(raw: unknown, siteId: SiteId = "zhushan"): StoreConfig {
  const defaults = defaultStoreConfigForSite(siteId);
  if (!raw || typeof raw !== "object") return defaults;
  const obj = raw as Record<string, unknown>;

  const featuresRaw =
    obj.features && typeof obj.features === "object"
      ? (obj.features as Record<string, unknown>)
      : {};
  const rotRaw =
    obj.rotationEvening && typeof obj.rotationEvening === "object"
      ? (obj.rotationEvening as Record<string, unknown>)
      : {};

  const weekdays = normalizeWeekdays(rotRaw.weekdays);
  const onDutyShift = isShiftCode(rotRaw.onDutyShift)
    ? rotRaw.onDutyShift
    : defaults.rotationEvening.onDutyShift;
  const offDutyShift = isShiftCode(rotRaw.offDutyShift)
    ? rotRaw.offDutyShift
    : defaults.rotationEvening.offDutyShift;

  let monthlyOffLimit: number | null = null;
  if (rotRaw.monthlyOffLimit === null || rotRaw.monthlyOffLimit === undefined) {
    monthlyOffLimit = null;
  } else {
    const n = Number(rotRaw.monthlyOffLimit);
    monthlyOffLimit = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }

  const menuLabel =
    typeof rotRaw.menuLabel === "string" && rotRaw.menuLabel.trim()
      ? rotRaw.menuLabel.trim()
      : defaults.rotationEvening.menuLabel;

  const features = {
    rotationEvening:
      typeof featuresRaw.rotationEvening === "boolean"
        ? featuresRaw.rotationEvening
        : defaults.features.rotationEvening,
    weekdayOffRule:
      typeof featuresRaw.weekdayOffRule === "boolean"
        ? featuresRaw.weekdayOffRule
        : defaults.features.weekdayOffRule,
    customShiftCatalog:
      typeof featuresRaw.customShiftCatalog === "boolean"
        ? featuresRaw.customShiftCatalog
        : defaults.features.customShiftCatalog,
  };

  const shiftCatalog = parseCatalogShifts(obj.shiftCatalog);
  const defaultOpts = {
    customShiftCatalog: features.customShiftCatalog,
    shiftCatalog,
  };

  return {
    version: 1,
    storeName:
      typeof obj.storeName === "string" && obj.storeName.trim()
        ? obj.storeName.trim()
        : defaults.storeName,
    siteId,
    shifts: normalizeShifts(obj.shifts),
    defaultWeekdayShift: resolveDefaultShiftCode(
      obj.defaultWeekdayShift,
      defaults.defaultWeekdayShift,
      defaultOpts
    ),
    defaultSaturdayShift: resolveDefaultShiftCode(
      obj.defaultSaturdayShift,
      defaults.defaultSaturdayShift,
      defaultOpts
    ),
    features,
    rotationEvening: {
      weekdays,
      onDutyShift,
      offDutyShift,
      monthlyOffLimit,
      menuLabel,
    },
    ruleTags: normalizeRuleTags(obj.ruleTags, menuLabel),
    shiftCatalog,
  };
}

export function getEnabledShiftCodes(config: StoreConfig): StoreShiftCode[] {
  return config.shifts.filter((s) => s.enabled).map((s) => s.code);
}

export function getShiftName(config: StoreConfig, code: string): string {
  if (config.features.customShiftCatalog) {
    const cat = config.shiftCatalog.find((s) => s.code === code);
    if (cat) return cat.name;
  }
  return config.shifts.find((s) => s.code === code)?.name ?? code;
}

export function getRuleTag(
  config: StoreConfig,
  id: StoreRuleTagId
): StoreRuleTag | undefined {
  return config.ruleTags.find((t) => t.id === id);
}

/** 可見的規則標籤（功能開關開啟者） */
export function getActiveRuleTags(config: StoreConfig): StoreRuleTag[] {
  return config.ruleTags.filter((tag) => {
    if (tag.id === "rotation_evening") return config.features.rotationEvening;
    if (tag.id === "weekday_off") return config.features.weekdayOffRule;
    return false;
  });
}

export function weekdayLabel(day: number): string {
  return WEEKDAY_NAMES[day] ?? String(day);
}

export function formatWeekdaysLabel(weekdays: number[]): string {
  if (weekdays.length === 0) return "";
  if (weekdays.length === 1) return `禮拜${weekdayLabel(weekdays[0])}`;
  return weekdays.map((d) => `禮拜${weekdayLabel(d)}`).join("、");
}

/** 依輪值設定產生建議選單名（可再手改） */
export function suggestRotationMenuLabel(weekdays: number[]): string {
  if (weekdays.length === 1) {
    const d = weekdays[0];
    if (d === 3) return "禮三晚班";
    return `週${weekdayLabel(d)}晚班`;
  }
  if (weekdays.length === 0) return "輪班";
  return "週期輪班";
}

export function isRotationEveningDay(
  dateStr: string,
  config: StoreConfig
): boolean {
  if (!config.features.rotationEvening) return false;
  const dow = getLocalDayOfWeek(dateStr);
  return config.rotationEvening.weekdays.includes(dow);
}

export function getMonthRotationDates(
  year: number,
  month: number,
  weekdays: number[]
): string[] {
  const dates: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const set = new Set(weekdays);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (set.has(getLocalDayOfWeek(dateStr))) dates.push(dateStr);
  }
  return dates;
}

export function resolveRotationOffLimit(
  year: number,
  month: number,
  config: StoreConfig
): number {
  const total = getMonthRotationDates(
    year,
    month,
    config.rotationEvening.weekdays
  ).length;
  if (
    config.rotationEvening.monthlyOffLimit != null &&
    config.rotationEvening.monthlyOffLimit >= 0
  ) {
    return Math.min(config.rotationEvening.monthlyOffLimit, total);
  }
  return Math.ceil(total / 2);
}
