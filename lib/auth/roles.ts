/** App 角色：副店與店長功能相同，審核關卡可分開。 */
export type AppRole = "owner" | "manager" | "deputy" | "staff";

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  owner: "老闆",
  manager: "店長",
  deputy: "副店",
  staff: "員工",
};

export type ApprovalStepRole = "manager" | "deputy" | "owner";

/** sequential＝依關卡順序；any＝店長／副店／老闆任一即可結案 */
export type ApprovalMode = "sequential" | "any";

export const APPROVAL_STEP_LABELS: Record<ApprovalStepRole, string> = {
  manager: "店長",
  deputy: "副店",
  owner: "老闆",
};

export const APPROVAL_MODE_LABELS: Record<ApprovalMode, string> = {
  sequential: "依關卡順序（店長 → 副店 → 老闆）",
  any: "店長／副店／老闆任一即可",
};

/** 店長／副店／老闆皆可管理本店（排班、審核、薪資等） */
export function canManageSite(role?: string | null): boolean {
  return role === "owner" || role === "manager" || role === "deputy";
}

export function isOwnerRole(role?: string | null): boolean {
  return role === "owner";
}

export function toDbRole(role: string): string {
  if (role === "staff") return "employee";
  if (role === "owner") return "boss";
  return role;
}

export function fromDbRole(role: string): AppRole {
  if (role === "boss" || role === "owner") return "owner";
  if (role === "manager") return "manager";
  if (role === "deputy") return "deputy";
  return "staff";
}

export function dbManagerRoles(): string[] {
  return ["boss", "owner", "manager", "deputy"];
}
