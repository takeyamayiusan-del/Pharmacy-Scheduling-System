import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { parseSiteId, type SiteId } from "@/lib/sites";

export type UserAuthOk = {
  callerId: string;
  role: string;
  siteId: SiteId;
  name: string;
};
export type UserAuthResult = UserAuthOk | { error: string; status: 401 | 403 };

export type ManagerAuthOk = { callerId: string; role: string; siteId: SiteId };
export type ManagerAuthResult = ManagerAuthOk | { error: string; status: 401 | 403 };

async function readSessionProfile(
  req: NextRequest
): Promise<UserAuthOk | { error: string; status: 401 | 403 }> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          return;
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "尚未登入或會話已失效", status: 401 };
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("users")
    .select("role, is_active, site_id, name")
    .eq("id", user.id)
    .single();

  if (error || !profile || !profile.is_active) {
    return { error: "找不到使用者資料", status: 403 };
  }

  return {
    callerId: user.id,
    role: profile.role,
    siteId: parseSiteId(profile.site_id),
    name: String(profile.name ?? ""),
  };
}

/** 驗證已登入且帳號啟用（員工亦可） */
export async function assertUserAuth(req: NextRequest): Promise<UserAuthResult> {
  return readSessionProfile(req);
}

/**
 * 驗證請求者為已登入的店長或老闆（用於 API Route Handler）
 */
export async function assertManagerAuth(req: NextRequest): Promise<ManagerAuthResult> {
  const auth = await readSessionProfile(req);
  if ("error" in auth) return auth;

  if (!["boss", "manager", "owner", "deputy"].includes(auth.role)) {
    return { error: "此帳號沒有管理權限", status: 403 };
  }

  return {
    callerId: auth.callerId,
    role: auth.role,
    siteId: auth.siteId,
  };
}

/** 老闆可跨店；店長僅能操作本店員工 */
export async function assertManagerCanAccessEmployee(
  auth: ManagerAuthOk,
  employeeId: string
): Promise<{ ok: true } | { error: string; status: 403 }> {
  if (auth.role === "owner" || auth.role === "boss") {
    return { ok: true };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("site_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (error || !data) {
    return { error: "找不到員工資料", status: 403 };
  }

  if (parseSiteId(data.site_id) !== auth.siteId) {
    return { error: "不可操作其他店的員工資料", status: 403 };
  }

  return { ok: true };
}
