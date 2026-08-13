import { NextRequest, NextResponse } from "next/server";
import {
  assertManagerCanAccessEmployee,
  assertUserAuth,
  type ManagerAuthOk,
} from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import { canManageSite, fromDbRole } from "@/lib/auth/roles";

type AppKind = "leave" | "overtime" | "swap" | "leave_deferral";

function isManagerRole(role: string) {
  return canManageSite(fromDbRole(role));
}

export async function POST(req: NextRequest) {
  try {
    const auth = await assertUserAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as { type?: AppKind; id?: string };
    const { type, id } = body;
    if (!id || !type || !["leave", "overtime", "swap", "leave_deferral"].includes(type)) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }

    const admin = createAdminClient();
    const manager = isManagerRole(auth.role);

    if (type === "leave") {
      const { data: row } = await admin
        .from("leave_applications")
        .select("id, user_id, status")
        .eq("id", id)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: "找不到請假申請" }, { status: 404 });
      if (manager) {
        const access = await assertManagerCanAccessEmployee(auth as ManagerAuthOk, row.user_id);
        if ("error" in access) {
          return NextResponse.json({ error: access.error }, { status: access.status });
        }
      } else if (row.user_id !== auth.callerId || row.status !== "pending") {
        return NextResponse.json({ error: "只能刪除自己的待審申請" }, { status: 403 });
      }
      await admin.from("leave_attachments").delete().eq("application_id", id);
      const { error } = await admin.from("leave_applications").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (type === "overtime") {
      const { data: row } = await admin
        .from("overtime_applications")
        .select("id, user_id, status")
        .eq("id", id)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: "找不到加班申請" }, { status: 404 });
      if (manager) {
        const access = await assertManagerCanAccessEmployee(auth as ManagerAuthOk, row.user_id);
        if ("error" in access) {
          return NextResponse.json({ error: access.error }, { status: access.status });
        }
      } else if (row.user_id !== auth.callerId || row.status !== "pending") {
        return NextResponse.json({ error: "只能刪除自己的待審申請" }, { status: 403 });
      }
      const { error } = await admin.from("overtime_applications").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (type === "swap") {
      const { data: row } = await admin
        .from("shift_swap_applications")
        .select("id, requester_id, target_id, status")
        .eq("id", id)
        .maybeSingle();
      if (!row) return NextResponse.json({ error: "找不到換班申請" }, { status: 404 });
      if (manager) {
        const access = await assertManagerCanAccessEmployee(
          auth as ManagerAuthOk,
          row.requester_id
        );
        if ("error" in access) {
          return NextResponse.json({ error: access.error }, { status: access.status });
        }
      } else {
        const own =
          row.requester_id === auth.callerId || row.target_id === auth.callerId;
        const pending =
          row.status === "pending_confirm" || row.status === "pending_review";
        if (!own || !pending) {
          return NextResponse.json({ error: "只能刪除自己的待審換班" }, { status: 403 });
        }
      }
      const { error } = await admin.from("shift_swap_applications").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const { data: row } = await admin
      .from("leave_deferral_requests")
      .select("id, user_id, status")
      .eq("id", id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "找不到遞延申請" }, { status: 404 });
    if (manager) {
      const access = await assertManagerCanAccessEmployee(auth as ManagerAuthOk, row.user_id);
      if ("error" in access) {
        return NextResponse.json({ error: access.error }, { status: access.status });
      }
    } else if (row.user_id !== auth.callerId || row.status !== "pending") {
      return NextResponse.json({ error: "只能刪除自己的待審申請" }, { status: 403 });
    }
    const { error } = await admin.from("leave_deferral_requests").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[applications/delete POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
