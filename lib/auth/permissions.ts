import type { AppRole } from "@/lib/auth/roles";
import { canManageSite } from "@/lib/auth/roles";
import type { StorePolicies } from "@/lib/store-policies";

/** 可額外授權給員工的能力（店長／副店／老闆仍依店規） */
export type CapabilityKey =
  | "schedule"
  | "payroll"
  | "employees"
  | "store_settings"
  | "punch_admin";

export const CAPABILITY_KEYS: CapabilityKey[] = [
  "schedule",
  "payroll",
  "employees",
  "store_settings",
  "punch_admin",
];

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  schedule: "排班／固定班／單人排班",
  payroll: "薪資結算",
  employees: "員工管理",
  store_settings: "店家設定",
  punch_admin: "打卡管理／遲到管理",
};

export type UserCapabilities = Partial<Record<CapabilityKey, boolean>>;

export type ManageRole = "owner" | "manager" | "deputy";

export type RoleCapabilityPolicy = {
  /** 副店是否等同店長（預設 true；關閉後副店僅剩審核／申請，需另開授權） */
  deputyLikeManager: boolean;
  /** 哪些職位可做排班（預設老闆／店長／副店） */
  scheduleRoles: ManageRole[];
  /** 哪些職位可做薪資結算試算／發布（預設僅老闆；會計請用員工＋薪資結算授權） */
  payrollRoles: ManageRole[];
  /** 哪些職位可登錄本月獎金加扣項（店長依銷售報表填寫，不含試算發布） */
  bonusSubmitRoles: ManageRole[];
  /** 哪些職位可管員工／店家設定／打卡管理 */
  adminRoles: ManageRole[];
  /** 是否允許對「員工」職位額外勾選授權 */
  allowStaffGrants: boolean;
};

export const DEFAULT_ROLE_CAPABILITY_POLICY: RoleCapabilityPolicy = {
  deputyLikeManager: true,
  scheduleRoles: ["owner", "manager", "deputy"],
  payrollRoles: ["owner"],
  bonusSubmitRoles: ["owner", "manager", "deputy"],
  adminRoles: ["owner", "manager", "deputy"],
  allowStaffGrants: true,
};

/** 店長／副店可代為勾選的員工授權（不可含薪資結算、員工管理、店家設定） */
export const MANAGER_GRANTABLE_CAPABILITIES: CapabilityKey[] = [
  "schedule",
  "punch_admin",
];

/** 獎金登錄常用項目（仍可手打自訂名稱） */
export const BONUS_ADJUSTMENT_PRESETS = [
  "個人獎金",
  "團體獎金",
  "業績獎金",
] as const;

export function parseUserCapabilities(raw: unknown): UserCapabilities {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const next: UserCapabilities = {};
  for (const key of CAPABILITY_KEYS) {
    if (typeof o[key] === "boolean") next[key] = o[key];
  }
  return next;
}

function asManageRoles(raw: unknown, fallback: ManageRole[]): ManageRole[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const allowed: ManageRole[] = ["owner", "manager", "deputy"];
  const next = raw.filter((x): x is ManageRole => allowed.includes(x as ManageRole));
  return next.length > 0 ? next : fallback;
}

export function parseRoleCapabilityPolicy(raw: unknown): RoleCapabilityPolicy {
  const d = DEFAULT_ROLE_CAPABILITY_POLICY;
  if (!raw || typeof raw !== "object") {
    return {
      ...d,
      scheduleRoles: [...d.scheduleRoles],
      payrollRoles: [...d.payrollRoles],
      bonusSubmitRoles: [...d.bonusSubmitRoles],
      adminRoles: [...d.adminRoles],
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    deputyLikeManager: typeof o.deputyLikeManager === "boolean" ? o.deputyLikeManager : d.deputyLikeManager,
    scheduleRoles: asManageRoles(o.scheduleRoles, d.scheduleRoles),
    payrollRoles: asManageRoles(o.payrollRoles, d.payrollRoles),
    bonusSubmitRoles: asManageRoles(o.bonusSubmitRoles, d.bonusSubmitRoles),
    adminRoles: asManageRoles(o.adminRoles, d.adminRoles),
    allowStaffGrants: typeof o.allowStaffGrants === "boolean" ? o.allowStaffGrants : d.allowStaffGrants,
  };
}

function roleListAllows(
  list: ManageRole[],
  role: AppRole | string | null | undefined,
  policy: RoleCapabilityPolicy
): boolean {
  if (role === "owner") return list.includes("owner");
  if (role === "manager") return list.includes("manager");
  if (role === "deputy") {
    if (list.includes("deputy")) return true;
    // 副店等同店長時，若列表有 manager 也算通過
    if (policy.deputyLikeManager && list.includes("manager")) return true;
    return false;
  }
  return false;
}

export type PermissionActor = {
  role?: AppRole | string | null;
  capabilities?: UserCapabilities | null;
};

/** 取得店規中的權限政策（缺欄位用預設） */
export function roleCapabilityPolicyOf(
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): RoleCapabilityPolicy {
  return policies?.roleCapabilities
    ? parseRoleCapabilityPolicy(policies.roleCapabilities)
    : { ...DEFAULT_ROLE_CAPABILITY_POLICY };
}

/**
 * 是否具備某項能力。
 * - 老闆／店長／副店：依店規角色清單
 * - 員工：僅在 allowStaffGrants 且個人 capabilities 勾選時
 */
export function hasCapability(
  actor: PermissionActor | null | undefined,
  key: CapabilityKey,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  if (!actor?.role) return false;
  const policy = roleCapabilityPolicyOf(policies);
  const role = actor.role;

  if (key === "schedule") {
    if (roleListAllows(policy.scheduleRoles, role, policy)) return true;
  } else if (key === "payroll") {
    if (roleListAllows(policy.payrollRoles, role, policy)) return true;
  } else {
    if (roleListAllows(policy.adminRoles, role, policy)) return true;
  }

  if (role === "staff" && policy.allowStaffGrants && actor.capabilities?.[key] === true) {
    return true;
  }
  // 副店關閉「等同店長」時，仍可用個人授權補上
  if (role === "deputy" && !policy.deputyLikeManager && actor.capabilities?.[key] === true) {
    return true;
  }
  return false;
}

export function canEditSchedule(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  return hasCapability(actor, "schedule", policies);
}

export function canManagePayroll(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  return hasCapability(actor, "payroll", policies);
}

/** 店長／副店登錄獎金加扣項（不含試算發布） */
export function canSubmitBonus(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  if (canManagePayroll(actor, policies)) return true;
  if (!actor?.role) return false;
  const policy = roleCapabilityPolicyOf(policies);
  return roleListAllows(policy.bonusSubmitRoles, actor.role, policy);
}

/** 老闆可授權全部；店長／副店僅能授權排班等非薪資能力 */
export function filterDelegatableCapabilities(
  granter: PermissionActor | null | undefined,
  requested: UserCapabilities | null | undefined
): UserCapabilities {
  if (!requested) return {};
  if (granter?.role === "owner") {
    const next: UserCapabilities = {};
    for (const key of CAPABILITY_KEYS) {
      if (requested[key]) next[key] = true;
    }
    return next;
  }
  const next: UserCapabilities = {};
  for (const key of MANAGER_GRANTABLE_CAPABILITIES) {
    if (requested[key]) next[key] = true;
  }
  return next;
}

export function canEditPermissionPolicy(
  actor: PermissionActor | null | undefined
): boolean {
  return actor?.role === "owner";
}

export function canSwitchSiteForPayroll(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  if (actor?.role === "owner") return true;
  return canManagePayroll(actor, policies);
}

/** 工時統計可看全店員工（店長／副店／老闆／會計薪資結算） */
export function canViewTeamAttendance(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  if (canManageSite(actor?.role)) return true;
  return canManagePayroll(actor, policies);
}

export function canManageEmployees(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  return hasCapability(actor, "employees", policies);
}

export function canEditStoreSettings(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  return hasCapability(actor, "store_settings", policies);
}

export function canUsePunchAdmin(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  return hasCapability(actor, "punch_admin", policies);
}

/** 與舊行為相容：有任一管理能力或傳統 canManageSite */
export function canManageAnything(
  actor: PermissionActor | null | undefined,
  policies: Pick<StorePolicies, "roleCapabilities"> | StorePolicies | null | undefined
): boolean {
  if (canManageSite(actor?.role)) return true;
  return CAPABILITY_KEYS.some((k) => hasCapability(actor, k, policies));
}

export function describeCapabilityGrants(caps: UserCapabilities | null | undefined): string {
  if (!caps) return "";
  const labels = CAPABILITY_KEYS.filter((k) => caps[k]).map((k) => CAPABILITY_LABELS[k]);
  return labels.join("、");
}
