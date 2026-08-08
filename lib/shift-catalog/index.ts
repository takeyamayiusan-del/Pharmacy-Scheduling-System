import headStoreTemplate from "@/lib/shift-catalog/head-store-template.json";
import type { CatalogShift, ShiftCategory, TimeRange } from "@/lib/shift-catalog/types";

export type { CatalogShift, ShiftCategory, TimeRange } from "@/lib/shift-catalog/types";
export { SHIFT_CATEGORY_LABELS } from "@/lib/shift-catalog/types";

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `sh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isTime(v: unknown): v is string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
}

function parseRange(raw: unknown): TimeRange | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isTime(o.start) || !isTime(o.end)) return null;
  return { start: o.start, end: o.end };
}

const CATEGORIES: ShiftCategory[] = [
  "day",
  "mid",
  "night",
  "split",
  "all_day",
  "off",
  "other",
];

export function parseCatalogShift(raw: unknown, index = 0): CatalogShift | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;
  const code =
    typeof o.code === "string" && o.code.trim()
      ? o.code.trim().slice(0, 24)
      : name.slice(0, 24);
  const category = CATEGORIES.includes(o.category as ShiftCategory)
    ? (o.category as ShiftCategory)
    : "other";
  const workSegments = Array.isArray(o.workSegments)
    ? (o.workSegments.map(parseRange).filter(Boolean) as TimeRange[])
    : [];
  const breaks = Array.isArray(o.breaks)
    ? (o.breaks.map(parseRange).filter(Boolean) as TimeRange[])
    : [];
  const nominalHours = Number(o.nominalHours);
  return {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : newId(),
    code,
    name,
    category,
    workSegments,
    breaks,
    nominalHours: Number.isFinite(nominalHours) ? nominalHours : 0,
    enabled: typeof o.enabled === "boolean" ? o.enabled : true,
    sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : index,
  };
}

export function parseCatalogShifts(raw: unknown): CatalogShift[] {
  if (!Array.isArray(raw)) return [];
  const list: CatalogShift[] = [];
  raw.forEach((item, i) => {
    const parsed = parseCatalogShift(item, i);
    if (parsed) list.push(parsed);
  });
  return list.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 總店 Excel 匯入後的範本（集集可一鍵載入；不影響竹山） */
export function getHeadStoreShiftTemplate(): CatalogShift[] {
  return parseCatalogShifts(headStoreTemplate).map((s, i) => ({
    ...s,
    id: newId(),
    sortOrder: i,
  }));
}

export function createEmptyCatalogShift(partial?: Partial<CatalogShift>): CatalogShift {
  const name = partial?.name?.trim() || "新班別";
  return {
    id: newId(),
    code: partial?.code?.trim() || name.slice(0, 24),
    name,
    category: partial?.category ?? "day",
    workSegments: partial?.workSegments?.length
      ? partial.workSegments
      : [{ start: "09:00", end: "18:00" }],
    breaks: partial?.breaks ?? [{ start: "12:30", end: "13:30" }],
    nominalHours: partial?.nominalHours ?? 8,
    enabled: partial?.enabled ?? true,
    sortOrder: partial?.sortOrder ?? 0,
  };
}

export function formatCatalogShiftSummary(shift: CatalogShift): string {
  const segs = shift.workSegments.map((s) => `${s.start}-${s.end}`).join("／");
  const br =
    shift.breaks.length > 0
      ? `；休 ${shift.breaks.map((b) => `${b.start}-${b.end}`).join("、")}`
      : "";
  return `${segs || "未設時段"}${br}（${shift.nominalHours}h）`;
}
