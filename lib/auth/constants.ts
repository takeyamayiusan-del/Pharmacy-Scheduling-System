/** 本機／自架環境的登入 email 網域（username@AUTH_EMAIL_DOMAIN） */
export const AUTH_EMAIL_DOMAIN = "yaosheng.app";

/** 系統預設管理者（本機 seed 建立，請勿刪除） */
export const DEFAULT_ADMIN_ACCOUNTS = [
  {
    username: "admin",
    password: "admin123",
    name: "店長",
    role: "manager" as const,
  },
  {
    username: "boss",
    password: "boss123",
    name: "老闆",
    role: "boss" as const,
  },
] as const;

export const PROTECTED_USERNAMES = new Set(
  DEFAULT_ADMIN_ACCOUNTS.map((a) => a.username)
);

export function toAuthEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

export function usernameFromEmail(email: string | undefined | null): string | undefined {
  if (!email) return undefined;
  const suffix = `@${AUTH_EMAIL_DOMAIN}`;
  if (!email.toLowerCase().endsWith(suffix)) return undefined;
  return email.slice(0, -suffix.length).toLowerCase();
}

/** AppContext 角色 → 資料庫角色 */
export function toDbRole(role: string): string {
  if (role === "staff") return "employee";
  if (role === "owner") return "boss";
  return role;
}

export function fromDbRole(role: string): "owner" | "manager" | "deputy" | "staff" {
  if (role === "boss") return "owner";
  if (role === "manager") return "manager";
  if (role === "deputy") return "deputy";
  return "staff";
}
