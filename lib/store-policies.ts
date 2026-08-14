import type { SiteId } from "@/lib/sites";
import type { ApprovalStepRole } from "@/lib/auth/roles";
import {
  parseLeaveRulesMap,
  statutoryLeaveRulesMap,
  type LeaveRulesMap,
} from "@/lib/attendance/leaveEntitlements";

export type { LeaveRulesMap } from "@/lib/attendance/leaveEntitlements";

/** 店規：打卡／加班／排休／審核／播假（兩店同一套程式，數值不同） */
export type SaturdayQuotaMode = "fixed" | "all_saturdays";

export type StorePolicies = {
  /** 可提早打卡分鐘數 */
  earlyPunchMinutes: number;
  /** 下班後幾分鐘起導向加班申請（竹山 10） */
  overtimeRedirectMinutes: number;
  /** 加班時數未滿此分鐘不可送出申請（集集 30） */
  overtimeMinApplyMinutes: number;
  /**
   * 超過此分鐘強制只能補休；null = 不強迫（員工／店長自選加班費或補休）。
   * 竹山 30；集集 null。
   */
  overtimeForceCompLeaveAfterMinutes: number | null;
  /** 員工每月打卡補登申請上限；null = 不限。店長打卡管理代改不計入。 */
  monthlyPunchCorrectionLimit: number | null;
  saturdayQuotaMode: SaturdayQuotaMode;
  saturdayLeaveQuota: number;
  weekdayLeaveQuota: number;
  sundayFixedRest: boolean;
  /** 排休半天也算一次機會 */
  halfDayLeaveCountsAsOne: boolean;
  /** 審核關卡順序（可客製）。僅申請類：請假／加班／換班／遞延／打卡補登 */
  approvalChain: ApprovalStepRole[];
  /** 特休／補休過期可提遞延申請 */
  allowLeaveDeferral: boolean;
  /**
   * 班表試算後，超時可「播假」預覽給店長確認。
   * 已鎖定月份不會默默改班表。
   */
  autoRestSuggestEnabled: boolean;
  /** 變形工時週期是否從個人入職日起算 */
  workHoursCycleFromHireDate: boolean;
  /** 假別天數換算（預設 8 小時＝1 日），僅供上限警示 */
  leaveHoursPerDay: number;
  /**
   * 假別上限／給薪覆寫。缺欄位時用勞基預設。
   * 天數上限只警示、不硬擋。
   */
  leaveRules: LeaveRulesMap;
};

export function defaultStorePoliciesForSite(siteId: SiteId | string): StorePolicies {
  const isJiji = siteId === "jiji";
  return {
    earlyPunchMinutes: isJiji ? 15 : 10,
    overtimeRedirectMinutes: isJiji ? 30 : 10,
    overtimeMinApplyMinutes: isJiji ? 30 : 0,
    overtimeForceCompLeaveAfterMinutes: isJiji ? null : 30,
    monthlyPunchCorrectionLimit: isJiji ? 2 : null,
    saturdayQuotaMode: isJiji ? "all_saturdays" : "fixed",
    saturdayLeaveQuota: 2,
    weekdayLeaveQuota: isJiji ? 0 : 2,
    sundayFixedRest: true,
    halfDayLeaveCountsAsOne: true,
    approvalChain: isJiji ? ["manager", "deputy", "owner"] : ["manager"],
    allowLeaveDeferral: isJiji,
    autoRestSuggestEnabled: isJiji,
    workHoursCycleFromHireDate: isJiji,
    leaveHoursPerDay: 8,
    leaveRules: statutoryLeaveRulesMap(),
  };
}

function asInt(v: unknown, fallback: number, min = 0, max = 24 * 60): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asNullableInt(v: unknown, fallback: number | null): number | null {
  if (v === null || v === undefined || v === "" || v === "null") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

const STEP_ROLES: ApprovalStepRole[] = ["manager", "deputy", "owner"];

function parseChain(raw: unknown, fallback: ApprovalStepRole[]): ApprovalStepRole[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const next = raw.filter((x): x is ApprovalStepRole =>
    STEP_ROLES.includes(x as ApprovalStepRole)
  );
  return next.length > 0 ? next : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

export function parseStorePolicies(
  raw: unknown,
  siteId: SiteId | string
): StorePolicies {
  const defaults = defaultStorePoliciesForSite(siteId);
  if (!raw || typeof raw !== "object") return defaults;
  const o = raw as Record<string, unknown>;
  return {
    earlyPunchMinutes: asInt(o.earlyPunchMinutes, defaults.earlyPunchMinutes, 0, 180),
    overtimeRedirectMinutes: asInt(
      o.overtimeRedirectMinutes,
      defaults.overtimeRedirectMinutes,
      0,
      240
    ),
    overtimeMinApplyMinutes: asInt(
      o.overtimeMinApplyMinutes,
      defaults.overtimeMinApplyMinutes,
      0,
      480
    ),
    overtimeForceCompLeaveAfterMinutes: asNullableInt(
      o.overtimeForceCompLeaveAfterMinutes,
      defaults.overtimeForceCompLeaveAfterMinutes
    ),
    monthlyPunchCorrectionLimit: asNullableInt(
      o.monthlyPunchCorrectionLimit,
      defaults.monthlyPunchCorrectionLimit
    ),
    saturdayQuotaMode:
      o.saturdayQuotaMode === "all_saturdays"
        ? "all_saturdays"
        : o.saturdayQuotaMode === "fixed"
          ? "fixed"
          : defaults.saturdayQuotaMode,
    saturdayLeaveQuota: asInt(o.saturdayLeaveQuota, defaults.saturdayLeaveQuota, 0, 10),
    weekdayLeaveQuota: asInt(o.weekdayLeaveQuota, defaults.weekdayLeaveQuota, 0, 20),
    sundayFixedRest: asBool(o.sundayFixedRest, defaults.sundayFixedRest),
    halfDayLeaveCountsAsOne: asBool(
      o.halfDayLeaveCountsAsOne,
      defaults.halfDayLeaveCountsAsOne
    ),
    approvalChain: parseChain(o.approvalChain, defaults.approvalChain),
    allowLeaveDeferral: asBool(o.allowLeaveDeferral, defaults.allowLeaveDeferral),
    autoRestSuggestEnabled: asBool(
      o.autoRestSuggestEnabled,
      defaults.autoRestSuggestEnabled
    ),
    workHoursCycleFromHireDate: asBool(
      o.workHoursCycleFromHireDate,
      defaults.workHoursCycleFromHireDate
    ),
    leaveHoursPerDay: asInt(o.leaveHoursPerDay, defaults.leaveHoursPerDay, 1, 24),
    leaveRules: {
      ...defaults.leaveRules,
      ...parseLeaveRulesMap(o.leaveRules),
    },
  };
}
