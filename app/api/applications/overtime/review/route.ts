import { NextRequest, NextResponse } from "next/server";
import {
  assertManagerOrApprover,
  assertManagerCanAccessEmployee,
} from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import { calcOvertimeHours } from "@/lib/attendance/overtimeCompensation";
import {
  canChooseOvertimePayWithPolicy,
  resolveOvertimeCreditedMinutes,
} from "@/lib/attendance/overtimePolicy";
import { fromDbRole } from "@/lib/auth/roles";
import {
  canActOnApprovalStep,
  currentApprovalRole,
  resolveApprovalDecision,
  rolesToNotify,
} from "@/lib/approvals/chain";
import { loadApprovalContext } from "@/lib/approvals/server";
import { isPastDate } from "@/lib/schedule/monthAccess";
import { parseSiteId } from "@/lib/sites";
import { APPROVAL_STEP_LABELS } from "@/lib/auth/roles";

type ReviewStatus = "approved" | "rejected" | "pending";

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
      .from("overtime_applications")
      .select(
        "id, user_id, overtime_date, start_time, end_time, compensation, status, approval_step"
      )
      .eq("id", id)
      .single();

    if (loadError || !row) {
      return NextResponse.json({ error: "找不到加班申請" }, { status: 404 });
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
    const { storeConfig, employees, chain, approvalMode } = await loadApprovalContext(
      admin,
      siteId
    );
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
    const startTime = String(row.start_time).slice(0, 5);
    const endTime = String(row.end_time).slice(0, 5);
    let compensation = row.compensation === "comp_leave" ? "time_off" : "pay";

    const isFinalApprove = decision.kind === "final";
    const forceCompLeave =
      isFinalApprove &&
      compensation === "pay" &&
      !canChooseOvertimePayWithPolicy(startTime, endTime, storeConfig.policies) &&
      !isPastDate(String(row.overtime_date).slice(0, 10));
    if (forceCompLeave) {
      compensation = "time_off";
    }

    const nextStatus: ReviewStatus =
      decision.kind === "advance" ? "pending" : status;
    const nextStep = decision.kind === "advance" ? decision.nextStep : currentStep;

    const { error: updateError } = await admin
      .from("overtime_applications")
      .update({
        status: nextStatus,
        approval_step: nextStep,
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
            type: "overtime_submitted",
            title: `加班待${APPROVAL_STEP_LABELS[decision.nextRole]}審核`,
            body: `${empRow?.name ?? "員工"} 的加班申請已過上一關，請審核。`,
            related_id: id,
            related_type: "overtime",
            is_read: false,
          }))
        );
      }
    }

    if (compensation === "time_off") {
      const credited = resolveOvertimeCreditedMinutes(
        startTime,
        endTime,
        storeConfig.policies
      );
      const hours = credited.creditedHours || calcOvertimeHours(startTime, endTime);
      const mealNote = credited.deductedMinutes > 0
        ? `（已扣用餐 ${credited.deductedMinutes} 分）`
        : "";
      if (isFinalApprove && prevStatus !== "approved") {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 6);
        const { error: creditError } = await admin.from("comp_leave_ledger").insert({
          user_id: row.user_id,
          hours,
          source_type: "overtime_credit",
          source_id: id,
          expires_at: expiresAt.toISOString(),
          note: forceCompLeave
            ? `加班逾門檻改補休 ${row.overtime_date}${mealNote}`
            : `加班轉補休 ${row.overtime_date}${mealNote}`,
        });
        if (creditError) {
          return NextResponse.json({ error: creditError.message }, { status: 500 });
        }
      }
      if (prevStatus === "approved" && nextStatus !== "approved") {
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
      advanced: decision.kind === "advance",
      finalApproved: isFinalApprove,
      nextStatus,
    });
  } catch (err) {
    console.error("[applications/overtime/review PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
