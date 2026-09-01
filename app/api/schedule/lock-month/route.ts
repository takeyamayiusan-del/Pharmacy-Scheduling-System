import { NextRequest, NextResponse } from "next/server";
import { assertManagerOrCapability } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import { parseSiteId } from "@/lib/sites";

type LockAction = "lock" | "unlock";

// POST /api/schedule/lock-month
// Body: { year, month, action, site_id? }
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerOrCapability(req, "schedule");
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as {
      year?: number;
      month?: number;
      action?: LockAction;
      site_id?: string;
    };

    const { year, month, action } = body;
    const siteId = parseSiteId(body.site_id);
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
        .eq("month", month)
        .eq("site_id", siteId);
      if (error) {
        console.error("[lock-month] unlock:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, action: "unlock", site_id: siteId });
    }

    const { data: existing } = await admin
      .from("leave_month_locks")
      .select("id")
      .eq("year", year)
      .eq("month", month)
      .eq("site_id", siteId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        action: "lock",
        alreadyLocked: true,
        site_id: siteId,
      });
    }

    const { data, error } = await admin
      .from("leave_month_locks")
      .insert({ year, month, site_id: siteId, locked_by: auth.callerId })
      .select("year, month, site_id, locked_by, locked_at")
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
