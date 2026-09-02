import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  assertManagerCanAccessEmployee,
  assertManagerOrCapability,
} from "@/lib/auth/server";
import { parseSiteId } from "@/lib/sites";
import { mapOffboardingRow, OFFBOARDING_SELECT } from "@/lib/offboarding/db";
import type { OffboardingType, PensionSystem, SettlementSnapshot } from "@/lib/offboarding/types";

function siteFilterForAuth(auth: { role: string; siteId: string }) {
  if (auth.role === "owner" || auth.role === "boss") return null;
  return auth.siteId;
}

export async function GET(req: NextRequest) {
  const auth = await assertManagerOrCapability(req, "employees");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const siteId = siteFilterForAuth(auth);
  let query = admin
    .from("employee_offboarding")
    .select(OFFBOARDING_SELECT)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (siteId) {
    query = query.eq("site_id", siteId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    records: (data ?? []).map((row) => mapOffboardingRow(row as Record<string, unknown>)),
  });
}

export async function POST(req: NextRequest) {
  const auth = await assertManagerOrCapability(req, "employees");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json()) as {
    userId?: string;
    offboardingType?: OffboardingType;
    pensionSystem?: PensionSystem;
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
  };

  if (!body.userId || !body.lastWorkDate || !body.settlementYear || !body.settlementMonth) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }

  const access = await assertManagerCanAccessEmployee(auth, body.userId);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const admin = createAdminClient();
  const { data: employee, error: empErr } = await admin
    .from("users")
    .select("id, site_id, role")
    .eq("id", body.userId)
    .single();

  if (empErr || !employee) {
    return NextResponse.json({ error: "找不到員工" }, { status: 404 });
  }
  if (employee.role === "owner") {
    return NextResponse.json({ error: "無法為老闆帳號建立離職結清" }, { status: 400 });
  }

  const siteId = parseSiteId(employee.site_id);
  const offboardingType = body.offboardingType ?? "resignation";
  const pensionSystem = body.pensionSystem ?? "new";

  const { data, error } = await admin
    .from("employee_offboarding")
    .insert({
      site_id: siteId,
      user_id: body.userId,
      offboarding_type: offboardingType,
      pension_system: pensionSystem,
      notice_start_date: body.noticeStartDate || null,
      notice_end_date: body.noticeEndDate || null,
      last_work_date: body.lastWorkDate,
      settlement_year: body.settlementYear,
      settlement_month: body.settlementMonth,
      average_monthly_wage: body.averageMonthlyWage ?? null,
      manual_severance_pay: body.manualSeverancePay ?? null,
      manual_annual_leave_payout: body.manualAnnualLeavePayout ?? null,
      manual_comp_leave_payout: body.manualCompLeavePayout ?? null,
      other_payout: body.otherPayout ?? 0,
      other_deduction: body.otherDeduction ?? 0,
      deactivate_on_complete: body.deactivateOnComplete ?? false,
      notes: body.notes ?? "",
      snapshot: body.snapshot ?? null,
      created_by: auth.callerId,
    })
    .select(OFFBOARDING_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ record: mapOffboardingRow(data as Record<string, unknown>) });
}
