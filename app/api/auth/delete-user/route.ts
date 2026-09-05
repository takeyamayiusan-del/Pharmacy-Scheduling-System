import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { assertManagerOrCapability, assertManagerCanAccessEmployee } from "@/lib/auth/server";
import { PROTECTED_USERNAMES } from "@/lib/auth/constants";

// POST /api/auth/delete-user
// Body: { userId }
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerOrCapability(req, "employees");
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { userId } = body as { userId: string };

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (userId === auth.callerId) {
      return NextResponse.json({ error: "無法刪除自己的帳號" }, { status: 403 });
    }

    const access = await assertManagerCanAccessEmployee(auth, userId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const admin = createAdminClient();
    const { data: target } = await admin
      .from("users")
      .select("username")
      .eq("id", userId)
      .single();

    if (target?.username && PROTECTED_USERNAMES.has(target.username)) {
      return NextResponse.json({ error: "無法刪除系統預設管理者帳號" }, { status: 403 });
    }

    const { error } = await admin.from("users").update({ is_active: false }).eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete-user]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
