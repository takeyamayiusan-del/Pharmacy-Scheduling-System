import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  assertManagerCanAccessEmployee,
  assertManagerOrCapability,
} from "@/lib/auth/server";
import { mapOffboardingRow, OFFBOARDING_SELECT } from "@/lib/offboarding/db";
import type { OffboardingStatus, SettlementSnapshot } from "@/lib/offboarding/types";

type RouteParams = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await assertManagerOrCapability(req, "employees");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchErr } = await admin
    .from("employee_offboarding")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: "找不到離職結清紀錄" }, { status: 404 });
  }

  const access = await assertManagerCanAccessEmployee(auth, existing.user_id);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await req.json()) as {
    offboardingType?: string;
    pensionSystem?: string;
    noticeStartDate?: string | null;
    noticeEndDate?: string | null;
    lastWorkDate?: string;
    settlementYear?: number;
    settlementMonth?: number;
    averageMonthlyWage?: number | null;
    manualSeverancePay?: number | null;
    manualAnnualLeavePayout?: number | null;
    manualCompLeavePayout?: number | null;
    otherPayout?: number;
    otherDeduction?: number;
    deactivateOnComplete?: boolean;
    notes?: string;
    snapshot?: SettlementSnapshot | null;
    status?: OffboardingStatus;
    applyEndDate?: boolean;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.offboardingType) updates.offboarding_type = body.offboardingType;
  if (body.pensionSystem) updates.pension_system = body.pensionSystem;
  if (body.noticeStartDate !== undefined) updates.notice_start_date = body.noticeStartDate || null;
  if (body.noticeEndDate !== undefined) updates.notice_end_date = body.noticeEndDate || null;
  if (body.lastWorkDate) updates.last_work_date = body.lastWorkDate;
  if (body.settlementYear) updates.settlement_year = body.settlementYear;
  if (body.settlementMonth) updates.settlement_month = body.settlementMonth;
  if (body.averageMonthlyWage !== undefined) updates.average_monthly_wage = body.averageMonthlyWage;
  if (body.manualSeverancePay !== undefined) updates.manual_severance_pay = body.manualSeverancePay;
  if (body.manualAnnualLeavePayout !== undefined) {
    updates.manual_annual_leave_payout = body.manualAnnualLeavePayout;
  }
  if (body.manualCompLeavePayout !== undefined) {
    updates.manual_comp_leave_payout = body.manualCompLeavePayout;
  }
  if (body.otherPayout !== undefined) updates.other_payout = body.otherPayout;
  if (body.otherDeduction !== undefined) updates.other_deduction = body.otherDeduction;
  if (body.deactivateOnComplete !== undefined) {
    updates.deactivate_on_complete = body.deactivateOnComplete;
  }
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.snapshot !== undefined) updates.snapshot = body.snapshot;

  const completing = body.status === "completed" && existing.status !== "completed";
  if (body.status) updates.status = body.status;
  if (completing) {
    updates.completed_at = new Date().toISOString();
  }

  const lastWorkDate = String(body.lastWorkDate ?? existing.last_work_date);
  const deactivateOnComplete = Boolean(
    body.deactivateOnComplete ?? existing.deactivate_on_complete
  );

  const { data, error } = await admin
    .from("employee_offboarding")
    .update(updates)
    .eq("id", params.id)
    .select(OFFBOARDING_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (completing || body.applyEndDate) {
    await admin
      .from("users")
      .update({ end_date: lastWorkDate })
      .eq("id", existing.user_id);

    if (completing && deactivateOnComplete) {
      await admin
        .from("users")
        .update({ is_active: false })
        .eq("id", existing.user_id);
    }
  }

  return NextResponse.json({ record: mapOffboardingRow(data as Record<string, unknown>) });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await assertManagerOrCapability(req, "employees");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("employee_offboarding")
    .select("user_id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "找不到離職結清紀錄" }, { status: 404 });
  }
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "僅草稿可刪除" }, { status: 400 });
  }

  const access = await assertManagerCanAccessEmployee(auth, existing.user_id);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { error } = await admin.from("employee_offboarding").delete().eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
