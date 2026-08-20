import { NextRequest, NextResponse } from "next/server";
import { assertUserAuth } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import { parseSiteId, storeConfigSettingId } from "@/lib/sites";
import { parseStoreConfig } from "@/lib/store-config";
import {
  currentMonthCreatedAtRange,
  isPunchCorrectionOverLimit,
  punchCorrectionOverLimitMessage,
} from "@/lib/attendance/punchCorrectionLimit";
import { loadApprovalContext } from "@/lib/approvals/server";
import { approvalPendingLabel, rolesToNotify } from "@/lib/approvals/chain";

type PunchAction = "work_in" | "work_out";

export async function POST(req: NextRequest) {
  try {
    const auth = await assertUserAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as {
      punchDate?: string;
      punchAction?: PunchAction;
      segmentIndex?: number;
      requestedTime?: string;
      originalRecordId?: string | null;
      reason?: string;
    };

    const punchDate = String(body.punchDate ?? "").slice(0, 10);
    const punchAction = body.punchAction;
    const requestedTime = String(body.requestedTime ?? "").slice(0, 5);
    const segmentIndex = Number(body.segmentIndex ?? 0) || 0;
    const reason = String(body.reason ?? "").trim();
    const originalRecordId = body.originalRecordId || null;

    if (!punchDate || !/^\d{4}-\d{2}-\d{2}$/.test(punchDate)) {
      return NextResponse.json({ error: "請選擇補登日期" }, { status: 400 });
    }
    if (punchAction !== "work_in" && punchAction !== "work_out") {
      return NextResponse.json({ error: "請選擇上班或下班" }, { status: 400 });
    }
    if (!/^\d{2}:\d{2}$/.test(requestedTime)) {
      return NextResponse.json({ error: "時間請用 HH:MM" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: empRow } = await admin
      .from("users")
      .select("id, name, site_id")
      .eq("id", auth.callerId)
      .maybeSingle();
    const siteId = parseSiteId(empRow?.site_id ?? auth.siteId);

    const { data: setting } = await admin
      .from("app_settings")
      .select("value")
      .eq("id", storeConfigSettingId(siteId))
      .maybeSingle();
    const storeConfig = parseStoreConfig(setting?.value, siteId);
    const limit = storeConfig.policies.monthlyPunchCorrectionLimit;

    const { startIso, endIso } = currentMonthCreatedAtRange();
    const { count, error: countError } = await admin
      .from("punch_correction_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.callerId)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .in("status", ["pending", "approved"]);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    const used = count ?? 0;
    if (isPunchCorrectionOverLimit(used, limit) && limit != null) {
      return NextResponse.json(
        { error: punchCorrectionOverLimitMessage(limit) },
        { status: 400 }
      );
    }

    if (originalRecordId) {
      const { data: original } = await admin
        .from("punch_records")
        .select("id, employee_id")
        .eq("id", originalRecordId)
        .maybeSingle();
      if (!original || original.employee_id !== auth.callerId) {
        return NextResponse.json({ error: "找不到要更正的打卡紀錄" }, { status: 400 });
      }
    }

    const { data: dup } = await admin
      .from("punch_correction_requests")
      .select("id")
      .eq("user_id", auth.callerId)
      .eq("punch_date", punchDate)
      .eq("punch_action", punchAction)
      .eq("segment_index", segmentIndex)
      .eq("status", "pending")
      .maybeSingle();
    if (dup) {
      return NextResponse.json(
        { error: "此日時段已有待審的補登申請" },
        { status: 400 }
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from("punch_correction_requests")
      .insert({
        user_id: auth.callerId,
        site_id: siteId,
        punch_date: punchDate,
        punch_action: punchAction,
        segment_index: segmentIndex,
        requested_time: requestedTime,
        original_record_id: originalRecordId,
        reason,
        status: "pending",
        approval_step: 0,
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      return NextResponse.json(
        { error: insertError?.message || "送出失敗" },
        { status: 500 }
      );
    }

    const { employees, chain, approvalMode } = await loadApprovalContext(admin, siteId);
    const firstRole = chain[0] ?? "manager";
    const nextRoles = rolesToNotify(firstRole, approvalMode);
    const recipients = employees.filter((e) => {
      if (!nextRoles.includes(e.role)) return false;
      if (e.role === "owner") return true;
      return e.siteId === siteId;
    });
    if (recipients.length > 0) {
      await admin.from("notifications").insert(
        recipients.map((m) => ({
          recipient_id: m.id,
          type: "punch_correction_submitted",
          title: "新打卡補登申請",
          body: `${empRow?.name ?? "員工"} 申請補登 ${punchDate} ${
            punchAction === "work_in" ? "上班" : "下班"
          } ${requestedTime}，請審核。`,
          related_id: inserted.id,
          related_type: "punch_correction",
          is_read: false,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      id: inserted.id,
      pendingLabel: approvalPendingLabel(chain, 0, approvalMode),
    });
  } catch (err) {
    console.error("[applications/punch-correction POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
