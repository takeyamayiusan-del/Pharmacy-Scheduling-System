import { NextRequest, NextResponse } from "next/server";
import { assertManagerAuth } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";

type LockAction = "lock" | "unlock";

// POST /api/schedule/lock-month
// Body: { year: number, month: number, action: "lock" | "unlock" }
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as {
      year?: number;
      month?: number;
      action?: LockAction;
    };

    const { year, month, action } = body;
    if (
      !year ||
      !month ||
      month < 1 ||
      month > 12 ||
      (action !== "lock" && action !== "unlock")
    ) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }

    const admin = createAdminClient();

    if (action === "unlock") {
      const { error } = await admin
        .from("leave_month_locks")
        .delete()
        .eq("year", year)
        .eq("month", month);
      if (error) {
        console.error("[lock-month] unlock:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, action: "unlock" });
    }

    const { data: existing } = await admin
      .from("leave_month_locks")
      .select("id")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, action: "lock", alreadyLocked: true });
    }

    const { data, error } = await admin
      .from("leave_month_locks")
      .insert({ year, month, locked_by: auth.callerId })
      .select("year, month, locked_by, locked_at")
      .single();

    if (error) {
      console.error("[lock-month] lock:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: "lock", lock: data });
  } catch (err) {
    console.error("[lock-month] unexpected:", err);
    return NextResponse.json({ error: "班表鎖定操作失敗" }, { status: 500 });
  }
}
