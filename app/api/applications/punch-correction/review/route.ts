import { NextRequest, NextResponse } from "next/server";
import {
  assertManagerOrApprover,
  assertManagerCanAccessEmployee,
} from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import { fromDbRole } from "@/lib/auth/roles";
import { APPROVAL_STEP_LABELS } from "@/lib/auth/roles";
import {
  canActOnApprovalStep,
  currentApprovalRole,
  resolveApprovalDecision,
  rolesToNotify,
} from "@/lib/approvals/chain";
import { loadApprovalContext } from "@/lib/approvals/server";
import { parseSiteId } from "@/lib/sites";

type ReviewStatus = "approved" | "rejected" | "pending";
type PunchAction = "work_in" | "work_out";

async function applyApprovedPunch(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    id: string;
    user_id: string;
    punch_date: string;
    punch_action: PunchAction;
    segment_index: number;
    requested_time: string;
    original_record_id: string | null;
    reason: string | null;
  }
) {
  const { data: emp } = await admin
    .from("users")
    .select("name")
    .eq("id", row.user_id)
    .maybeSingle();
  const employeeName = String(emp?.name ?? "員工").slice(0, 10);
  const time = String(row.requested_time).slice(0, 8);
  const note = `打卡補登核准${row.reason ? `：${row.reason}` : ""}`;

  let recordId = row.original_record_id;
  if (!recordId) {
    const { data: existing } = await admin
      .from("punch_records")
      .select("id")
      .eq("employee_id", row.user_id)
      .eq("date", row.punch_date)
      .eq("action", row.punch_action)
      .eq("segment_index", row.segment_index)
      .maybeSingle();
    recordId = existing?.id ?? null;
  }

  if (recordId) {
    const { error } = await admin
      .from("punch_records")
      .update({
        time,
        reason: note,
        late_minutes: 0,
      })
      .eq("id", recordId);
    if (error) throw new Error(error.message);
    return;
  }

  const { data: sched } = await admin
    .from("schedule_entries")
    .select("shift_code")
    .eq("user_id", row.user_id)
    .eq("date", row.punch_date)
    .maybeSingle();
  const shift = String(sched?.shift_code ?? "B").slice(0, 24);

  const { error } = await admin.from("punch_records").insert({
    employee_id: row.user_id,
    employee_name: employeeName,
    date: row.punch_date,
    action: row.punch_action,
    segment_index: row.segment_index,
    time,
    shift,
    late_minutes: 0,
    reason: note,
    latitude: 0,
    longitude: 0,
  });
  if (error) throw new Error(error.message);
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await assertManagerOrApprover(req);
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
      .from("punch_correction_requests")
      .select(
        "id, user_id, punch_date, punch_action, segment_index, requested_time, original_record_id, reason, status, approval_step"
      )
      .eq("id", id)
      .single();

    if (loadError || !row) {
      return NextResponse.json({ error: "找不到打卡補登申請" }, { status: 404 });
    }

    const access = await assertManagerCanAccessEmployee(auth, row.user_id);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { data: empRow } = await admin
      .from("users")
      .select("id, role, site_id, name")
      .eq("id", row.user_id)
      .maybeSingle();
    const siteId = parseSiteId(empRow?.site_id ?? auth.siteId);
    const { employees, chain, approvalMode } = await loadApprovalContext(admin, siteId);

    const actorRole = fromDbRole(auth.role);
    const currentStep = Number(row.approval_step ?? 0) || 0;
    const required = currentApprovalRole(chain, currentStep);
    if (status !== "pending" && !canActOnApprovalStep(actorRole, required, approvalMode, auth.capabilities)) {
      return NextResponse.json(
        {
          error:
            approvalMode === "any"
              ? "僅店長、副店、老闆或授權審核者可審核"
              : `目前關卡為「${APPROVAL_STEP_LABELS[required]}」，您無法審核`,
        },
        { status: 403 }
      );
    }

    const decision = resolveApprovalDecision(chain, currentStep, status, approvalMode);
    const prevStatus = row.status as ReviewStatus;
    const isFinalApprove = decision.kind === "final";
    const nextStatus: ReviewStatus =
      decision.kind === "advance" ? "pending" : status;
    const nextStep = decision.kind === "advance" ? decision.nextStep : currentStep;

    if (isFinalApprove && prevStatus !== "approved") {
      await applyApprovedPunch(admin, {
        id: row.id,
        user_id: row.user_id,
        punch_date: String(row.punch_date).slice(0, 10),
        punch_action: row.punch_action as PunchAction,
        segment_index: Number(row.segment_index ?? 0) || 0,
        requested_time: String(row.requested_time),
        original_record_id: row.original_record_id,
        reason: row.reason,
      });
    }

    const { error: updateError } = await admin
      .from("punch_correction_requests")
      .update({
        status: nextStatus,
        approval_step:
          status === "approved" && isFinalApprove
            ? Math.max(chain.length - 1, 0)
            : nextStep,
        reviewed_by: auth.callerId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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

    if (decision.kind === "advance") {
      const nextRoles = rolesToNotify(decision.nextRole, approvalMode);
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
            title: `打卡補登待${APPROVAL_STEP_LABELS[decision.nextRole]}審核`,
            body: `${empRow?.name ?? "員工"} 的打卡補登已過上一關，請審核。`,
            related_id: id,
            related_type: "punch_correction",
            is_read: false,
          }))
        );
      }
      await admin.from("notifications").insert({
        recipient_id: row.user_id,
        type: "punch_correction_reviewed",
        title: "打卡補登已過一關",
        body: `您的打卡補登已由${APPROVAL_STEP_LABELS[required]}通過，待${APPROVAL_STEP_LABELS[decision.nextRole]}審核。`,
        related_id: id,
        related_type: "punch_correction",
        is_read: false,
      });
    }

    if (decision.kind === "final" || decision.kind === "reject") {
      const statusText = status === "approved" ? "已核准" : "已駁回";
      let body = `打卡補登（${String(row.punch_date).slice(0, 10)}）${statusText}。`;
      if (status === "rejected" && rejectReason?.trim()) {
        body += ` 原因：${rejectReason.trim()}`;
      }
      await admin.from("notifications").insert({
        recipient_id: row.user_id,
        type: "punch_correction_reviewed",
        title: `打卡補登${statusText}`,
        body,
        related_id: id,
        related_type: "punch_correction",
        is_read: false,
      });
    }

    return NextResponse.json({
      success: true,
      advanced: decision.kind === "advance",
      finalApproved: isFinalApprove,
      nextStatus,
    });
  } catch (err) {
    console.error("[applications/punch-correction/review PATCH]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
