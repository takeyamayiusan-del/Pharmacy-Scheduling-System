import { NextRequest, NextResponse } from "next/server";
import {
  assertManagerOrApprover,
  assertManagerCanAccessEmployee,
} from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import { calcOvertimeHours } from "@/lib/attendance/overtimeCompensation";

type CompensationType = "pay" | "time_off";

/**
 * 店長／老闆調整加班申請補償方式（加班費 ↔ 補休）。
 * 已核准者會同步調整補休帳本，避免員工一一重申請。
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await assertManagerOrApprover(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as {
      id?: string;
      compensationType?: CompensationType;
    };

    const { id, compensationType } = body;
    if (!id || !compensationType || !["pay", "time_off"].includes(compensationType)) {
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

    const access = await assertManagerCanAccessEmployee(auth, row.user_id);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const prevCompensation: CompensationType =
      row.compensation === "comp_leave" ? "time_off" : "pay";
    if (prevCompensation === compensationType) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    const dbCompensation = compensationType === "time_off" ? "comp_leave" : "pay";
    const { error: updateError } = await admin
      .from("overtime_applications")
      .update({
        compensation: dbCompensation,
        reviewed_by: auth.callerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const status = row.status as string;
    if (status === "approved") {
      const startTime = String(row.start_time).slice(0, 5);
      const endTime = String(row.end_time).slice(0, 5);
      const hours = calcOvertimeHours(startTime, endTime);

      if (prevCompensation === "pay" && compensationType === "time_off") {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);
        const { error: creditError } = await admin.from("comp_leave_ledger").insert({
          user_id: row.user_id,
          hours,
          source_type: "overtime_credit",
          source_id: id,
          expires_at: expiresAt.toISOString(),
          note: `店長改為補休 ${row.overtime_date}`,
        });
        if (creditError) {
          return NextResponse.json({ error: creditError.message }, { status: 500 });
        }
      }

      if (prevCompensation === "time_off" && compensationType === "pay") {
        const { error: reversalError } = await admin.from("comp_leave_ledger").insert({
          user_id: row.user_id,
          hours: -hours,
          source_type: "reversal",
          source_id: id,
          note: `店長改為加班費，扣回補休 ${row.overtime_date}`,
        });
        if (reversalError) {
          return NextResponse.json({ error: reversalError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      success: true,
      from: prevCompensation,
      to: compensationType,
    });
  } catch (err) {
    console.error("[applications/overtime/compensation PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
