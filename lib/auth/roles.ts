/** App 角色：副店與店長功能相同，審核關卡可分開。主任同員工權限，但走管理端登入。會計跨店薪資、仍屬單店上班。 */
export type AppRole = "owner" | "manager" | "deputy" | "director" | "accountant" | "staff";

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  owner: "老闆",
  manager: "店長",
  deputy: "副店",
  director: "主任",
  accountant: "會計",
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

/** 員工／主任／會計：預設無完整店長權，可經 capabilities 額外授權（會計自帶薪資結算） */
export function isStaffLikeRole(role?: string | null): boolean {
  return role === "staff" || role === "director" || role === "accountant";
}

/** 會計：管理端登入、跨店薪資檢視，排班打卡仍限所屬店 */
export function isAccountantRole(role?: string | null): boolean {
  return role === "accountant";
}

/** 可切換薪資檢視店別（老闆、會計；或員工＋薪資授權） */
export function canUsePayrollSiteView(role?: string | null): boolean {
  return role === "owner" || role === "accountant";
}

export function isOwnerRole(role?: string | null): boolean {
  return role === "owner";
}

export function toDbRole(role: string): string {
  if (role === "staff") return "employee";
  if (role === "owner") return "boss";
  if (role === "director") return "director";
  if (role === "accountant") return "accountant";
  return role;
}

export function fromDbRole(role: string): AppRole {
  if (role === "boss" || role === "owner") return "owner";
  if (role === "manager") return "manager";
  if (role === "deputy") return "deputy";
  if (role === "director") return "director";
  if (role === "accountant") return "accountant";
  return "staff";
}

/** 可走「店長／老闆登入」分頁的 DB 角色 */
export function managerPortalDbRoles(): string[] {
  return ["boss", "owner", "manager", "deputy", "director", "accountant"];
}

export function dbManagerRoles(): string[] {
  return ["boss", "owner", "manager", "deputy"];
}
