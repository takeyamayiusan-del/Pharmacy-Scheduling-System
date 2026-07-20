import { NextRequest, NextResponse } from "next/server";
import { assertManagerAuth } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";

type SyncAction = "add" | "remove";

// POST /api/schedule/sync-leave-selection
// Body: { employeeId, date, action: "add" | "remove" }
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as {
      employeeId?: string;
      date?: string;
      action?: SyncAction;
    };

    const { employeeId, date, action } = body;
    if (!employeeId || !date || (action !== "add" && action !== "remove")) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }

    const admin = createAdminClient();

    if (action === "add") {
      const { error } = await admin
        .from("leave_selections")
        .insert({ user_id: employeeId, date });
      if (error && error.code !== "23505") {
        console.error("[sync-leave-selection] insert:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await admin
        .from("leave_selections")
        .delete()
        .eq("user_id", employeeId)
        .eq("date", date);
      if (error) {
        console.error("[sync-leave-selection] delete:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sync-leave-selection]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
