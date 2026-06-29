import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export type ManagerAuthResult =
  | { callerId: string; role: string }
  | { error: string; status: 401 | 403 };

/**
 * 驗證請求者為已登入的店長或老闆（用於 API Route Handler）
 */
export async function assertManagerAuth(req: NextRequest): Promise<ManagerAuthResult> {
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
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (error || !profile || !profile.is_active) {
    return { error: "找不到使用者資料", status: 403 };
  }

  if (!["boss", "manager"].includes(profile.role)) {
    return { error: "此帳號沒有管理權限", status: 403 };
  }

  return { callerId: user.id, role: profile.role };
}
