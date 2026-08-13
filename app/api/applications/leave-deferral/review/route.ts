import { NextRequest, NextResponse } from "next/server";
import {
  assertManagerAuth,
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
type DeferralKind = "annual" | "comp";

async function applyApprovedDeferral(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    id: string;
    user_id: string;
    leave_kind: DeferralKind;
    hours: number;
    original_expire: string | null;
    new_expire: string;
  },
  reviewerId: string
) {
  if (row.leave_kind === "annual") {
    const year = Number(String(row.new_expire).slice(0, 4));
    const days = Math.round((Number(row.hours) / 8) * 100) / 100;
    const { error } = await admin.from("annual_leave_adjustments").insert({
      user_id: row.user_id,
      year,
      adjustment_days: days,
      reason: `特休遞延核准（原到期 ${row.original_expire ?? "—"} → ${row.new_expire}）`,
      created_by: reviewerId,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await admin.from("comp_leave_ledger").insert({
    user_id: row.user_id,
    hours: Number(row.hours),
    source_type: "adjustment",
    source_id: row.id,
    expires_at: new Date(`${row.new_expire}T00:00:00`).toISOString(),
    note: `補休遞延核准（原到期 ${row.original_expire ?? "—"} → ${row.new_expire}）`,
  });
  if (error) throw new Error(error.message);
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
      .from("leave_deferral_requests")
      .select(
        "id, user_id, leave_kind, hours, original_expire, new_expire, status, approval_step"
      )
      .eq("id", id)
      .single();

    if (loadError || !row) {
      return NextResponse.json({ error: "找不到遞延申請" }, { status: 404 });
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
    const { employees, chain } = await loadApprovalContext(admin, siteId);

    const actorRole = fromDbRole(auth.role);
    const currentStep = Number(row.approval_step ?? 0) || 0;
    const required = currentApprovalRole(chain, currentStep);
    if (status !== "pending" && !canActOnApprovalStep(actorRole, required)) {
      return NextResponse.json(
        { error: `目前關卡為「${APPROVAL_STEP_LABELS[required]}」，您無法審核` },
        { status: 403 }
      );
    }

    const decision = resolveApprovalDecision(chain, currentStep, status);
    const prevStatus = row.status as ReviewStatus;
    const isFinalApprove = decision.kind === "final";
    const nextStatus: ReviewStatus =
      decision.kind === "advance" ? "pending" : status;
    const nextStep = decision.kind === "advance" ? decision.nextStep : currentStep;

    if (isFinalApprove && prevStatus !== "approved") {
      await applyApprovedDeferral(
        admin,
        {
          id: row.id,
          user_id: row.user_id,
          leave_kind: row.leave_kind as DeferralKind,
          hours: Number(row.hours),
          original_expire: row.original_expire,
          new_expire: String(row.new_expire).slice(0, 10),
        },
        auth.callerId
      );
    }

    const { error: updateError } = await admin
      .from("leave_deferral_requests")
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
      const nextRoles = rolesToNotify(decision.nextRole);
      const recipients = employees.filter((e) => {
        if (!nextRoles.includes(e.role)) return false;
        if (e.role === "owner") return true;
        return e.siteId === siteId;
      });
      if (recipients.length > 0) {
        await admin.from("notifications").insert(
          recipients.map((m) => ({
            recipient_id: m.id,
            type: "leave_deferral_submitted",
            title: `假別遞延待${APPROVAL_STEP_LABELS[decision.nextRole]}審核`,
            body: `${empRow?.name ?? "員工"} 的特休／補休遞延已過上一關，請審核。`,
            related_id: id,
            related_type: "leave_deferral",
            is_read: false,
          }))
        );
      }
      await admin.from("notifications").insert({
        recipient_id: row.user_id,
        type: "leave_deferral_reviewed",
        title: "假別遞延已過一關",
        body: `您的遞延申請已由${APPROVAL_STEP_LABELS[required]}通過，待${APPROVAL_STEP_LABELS[decision.nextRole]}審核。`,
        related_id: id,
        related_type: "leave_deferral",
        is_read: false,
      });
    }

    if (decision.kind === "final" || decision.kind === "reject") {
      const statusText = status === "approved" ? "已核准" : "已駁回";
      let body = `特休／補休遞延申請${statusText}。`;
      if (status === "rejected" && rejectReason?.trim()) {
        body += ` 原因：${rejectReason.trim()}`;
      }
      await admin.from("notifications").insert({
        recipient_id: row.user_id,
        type: "leave_deferral_reviewed",
        title: `假別遞延${statusText}`,
        body,
        related_id: id,
        related_type: "leave_deferral",
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
    console.error("[applications/leave-deferral/review PATCH]", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
