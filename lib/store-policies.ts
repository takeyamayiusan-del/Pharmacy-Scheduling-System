import type { SiteId } from "@/lib/sites";
import type { ApprovalMode, ApprovalStepRole } from "@/lib/auth/roles";
import {
  parseLeaveRulesMap,
  statutoryLeaveRulesMap,
  type LeaveRulesMap,
} from "@/lib/attendance/leaveEntitlements";
import {
  DEFAULT_ROLE_CAPABILITY_POLICY,
  parseRoleCapabilityPolicy,
  type RoleCapabilityPolicy,
} from "@/lib/auth/permissions";

export type { LeaveRulesMap } from "@/lib/attendance/leaveEntitlements";

/** 店規：打卡／加班／排休／審核／播假（兩店同一套程式，數值不同） */
export type SaturdayQuotaMode = "fixed" | "all_saturdays" | "month_pool";

export type StorePolicies = {
  /** 可提早打卡分鐘數 */
  earlyPunchMinutes: number;
  /** 下班後幾分鐘起導向加班申請（竹山 10） */
  overtimeRedirectMinutes: number;
  /** 加班時數未滿此分鐘不可送出申請（兩店預設 30＝滿半小時才算） */
  overtimeMinApplyMinutes: number;
  /**
   * 超過此分鐘強制只能補休；null = 不強迫（員工／店長自選加班費或補休）。
   * 兩店預設 60＝一小時內可選加班費或補休，超過固定補休。
   */
  overtimeForceCompLeaveAfterMinutes: number | null;
  /**
   * 加班超過此分鐘自動扣除用餐／休息；null＝不扣。
   * 兩店預設 240（4 小時）。
   */
  overtimeMealDeductAfterMinutes: number | null;
  /** 逾門檻時扣除的分鐘數（兩店預設 30） */
  overtimeMealDeductMinutes: number;
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
  /**
   * sequential：申請依關卡順序審（集集）。
   * any：店長／副店／老闆誰來都能結案（竹山）。
   * 排班、播假、薪資結算一律誰有管理權就能做，不走關卡。
   */
  approvalMode: ApprovalMode;
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
  /**
   * 職位預設權限與員工額外授權開關。
   * 排班／薪資／員工管理等可調；員工職位可另開 capabilities。
   */
  roleCapabilities: RoleCapabilityPolicy;
};

export function defaultStorePoliciesForSite(siteId: SiteId | string): StorePolicies {
  const isJiji = siteId === "jiji";
  return {
    earlyPunchMinutes: isJiji ? 15 : 10,
    overtimeRedirectMinutes: isJiji ? 30 : 10,
    // 兩店統一：滿半小時才算、1 小時內可選加班費／補休、逾 4 小時扣 30 分
    overtimeMinApplyMinutes: 30,
    overtimeForceCompLeaveAfterMinutes: 60,
    overtimeMealDeductAfterMinutes: 240,
    overtimeMealDeductMinutes: 30,
    monthlyPunchCorrectionLimit: isJiji ? 2 : null,
    saturdayQuotaMode: isJiji ? "month_pool" : "fixed",
    saturdayLeaveQuota: 2,
    weekdayLeaveQuota: isJiji ? 0 : 2,
    sundayFixedRest: true,
    halfDayLeaveCountsAsOne: true,
    approvalChain: isJiji ? ["manager", "deputy", "owner"] : ["manager"],
    approvalMode: isJiji ? "sequential" : "any",
    allowLeaveDeferral: isJiji,
    autoRestSuggestEnabled: isJiji,
    workHoursCycleFromHireDate: isJiji,
    leaveHoursPerDay: 8,
    leaveRules: statutoryLeaveRulesMap(),
    roleCapabilities: {
      ...DEFAULT_ROLE_CAPABILITY_POLICY,
      scheduleRoles: [...DEFAULT_ROLE_CAPABILITY_POLICY.scheduleRoles],
      payrollRoles: [...DEFAULT_ROLE_CAPABILITY_POLICY.payrollRoles],
      bonusSubmitRoles: [...DEFAULT_ROLE_CAPABILITY_POLICY.bonusSubmitRoles],
      adminRoles: [...DEFAULT_ROLE_CAPABILITY_POLICY.adminRoles],
    },
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

function parseSaturdayQuotaMode(
  raw: unknown,
  fallback: SaturdayQuotaMode
): SaturdayQuotaMode {
  if (raw === "month_pool" || raw === "all_saturdays" || raw === "fixed") {
    return raw;
  }
  return fallback;
}

function parseApprovalMode(raw: unknown, fallback: ApprovalMode): ApprovalMode {
  if (raw === "sequential" || raw === "any") return raw;
  return fallback;
}

export function parseStorePolicies(
  raw: unknown,
  siteId: SiteId | string
): StorePolicies {
  const defaults = defaultStorePoliciesForSite(siteId);
  if (!raw || typeof raw !== "object") return defaults;
  const o = raw as Record<string, unknown>;
  const weekdayLeaveQuota = asInt(o.weekdayLeaveQuota, defaults.weekdayLeaveQuota, 0, 20);
  let saturdayQuotaMode = parseSaturdayQuotaMode(
    o.saturdayQuotaMode,
    defaults.saturdayQuotaMode
  );
  if (saturdayQuotaMode === "all_saturdays" && weekdayLeaveQuota <= 0) {
    saturdayQuotaMode = "month_pool";
  }
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
    overtimeMealDeductAfterMinutes: asNullableInt(
      o.overtimeMealDeductAfterMinutes,
      defaults.overtimeMealDeductAfterMinutes
    ),
    overtimeMealDeductMinutes: asInt(
      o.overtimeMealDeductMinutes,
      defaults.overtimeMealDeductMinutes,
      0,
      180
    ),
    monthlyPunchCorrectionLimit: asNullableInt(
      o.monthlyPunchCorrectionLimit,
      defaults.monthlyPunchCorrectionLimit
    ),
    saturdayQuotaMode,
    saturdayLeaveQuota: asInt(o.saturdayLeaveQuota, defaults.saturdayLeaveQuota, 0, 10),
    weekdayLeaveQuota,
    sundayFixedRest: asBool(o.sundayFixedRest, defaults.sundayFixedRest),
    halfDayLeaveCountsAsOne: asBool(
      o.halfDayLeaveCountsAsOne,
      defaults.halfDayLeaveCountsAsOne
    ),
    approvalChain: parseChain(o.approvalChain, defaults.approvalChain),
    approvalMode: parseApprovalMode(o.approvalMode, defaults.approvalMode),
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
    roleCapabilities: parseRoleCapabilityPolicy(
      o.roleCapabilities ?? defaults.roleCapabilities
    ),
  };
}
