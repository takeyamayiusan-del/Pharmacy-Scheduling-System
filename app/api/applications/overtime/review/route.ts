import { NextRequest, NextResponse } from "next/server";
import { assertManagerAuth } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";

type ReviewStatus = "approved" | "rejected" | "pending";

function overtimeHoursBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100) / 100;
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as {
      id?: string;
      status?: ReviewStatus;
      rejectReason?: string;
    };

    const { id, status, rejectReason } = body;
    if (!id || !status || !["approved", "rejected", "pending"].includes(status)) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row, error: loadError } = await admin
      .from("overtime_applications")
      .select("id, user_id, overtime_date, start_time, end_time, compensation, status")
      .eq("id", id)
      .single();

    if (loadError || !row) {
      return NextResponse.json({ error: "找不到加班申請" }, { status: 404 });
    }

    const prevStatus = row.status as ReviewStatus;
    const compensation = row.compensation === "comp_leave" ? "time_off" : "pay";

    const { error: updateError } = await admin
      .from("overtime_applications")
      .update({
        status,
        reviewed_by: auth.callerId,
        reviewed_at: new Date().toISOString(),
        ...(status === "rejected" && rejectReason?.trim()
          ? { reject_reason: rejectReason.trim() }
          : status !== "rejected"
            ? { reject_reason: null }
            : {}),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (compensation === "time_off") {
      const hours = overtimeHoursBetween(
        String(row.start_time).slice(0, 5),
        String(row.end_time).slice(0, 5)
      );
      if (status === "approved" && prevStatus !== "approved") {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);
        const { error: creditError } = await admin.from("comp_leave_ledger").insert({
          user_id: row.user_id,
          hours,
          source_type: "overtime_credit",
          source_id: id,
          expires_at: expiresAt.toISOString(),
          note: `加班轉補休 ${row.overtime_date}`,
        });
        if (creditError) {
          return NextResponse.json({ error: creditError.message }, { status: 500 });
        }
      }
      if (prevStatus === "approved" && status !== "approved") {
        const { error: reversalError } = await admin.from("comp_leave_ledger").insert({
          user_id: row.user_id,
          hours: -hours,
          source_type: "reversal",
          source_id: id,
          note: "加班補休核准取消，扣回時數",
        });
        if (reversalError) {
          return NextResponse.json({ error: reversalError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[applications/overtime/review PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
