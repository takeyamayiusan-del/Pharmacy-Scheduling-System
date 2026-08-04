import { NextRequest, NextResponse } from "next/server";
import { assertManagerAuth } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  canChooseOvertimePay,
  calcOvertimeHours,
} from "@/lib/attendance/overtimeCompensation";
import { isPastDate } from "@/lib/schedule/monthAccess";

type ReviewStatus = "approved" | "rejected" | "pending";

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
    const startTime = String(row.start_time).slice(0, 5);
    const endTime = String(row.end_time).slice(0, 5);
    let compensation = row.compensation === "comp_leave" ? "time_off" : "pay";

    // 超過半小時卻選加班費：核准時自動改為補休
    // 過去月份維持原選擇（避免月底補審時把已申請的加班費改成補休）
    const forceCompLeave =
      status === "approved" &&
      compensation === "pay" &&
      !canChooseOvertimePay(startTime, endTime) &&
      !isPastDate(String(row.overtime_date).slice(0, 10));
    if (forceCompLeave) {
      compensation = "time_off";
    }

    const { error: updateError } = await admin
      .from("overtime_applications")
      .update({
        status,
        reviewed_by: auth.callerId,
        reviewed_at: new Date().toISOString(),
        ...(forceCompLeave ? { compensation: "comp_leave" } : {}),
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
      const hours = calcOvertimeHours(startTime, endTime);
      if (status === "approved" && prevStatus !== "approved") {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);
        const { error: creditError } = await admin.from("comp_leave_ledger").insert({
          user_id: row.user_id,
          hours,
          source_type: "overtime_credit",
          source_id: id,
          expires_at: expiresAt.toISOString(),
          note: forceCompLeave
            ? `加班逾半小時改補休 ${row.overtime_date}`
            : `加班轉補休 ${row.overtime_date}`,
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

    return NextResponse.json({
      success: true,
      convertedToCompLeave: forceCompLeave,
    });
  } catch (err) {
    console.error("[applications/overtime/review PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
