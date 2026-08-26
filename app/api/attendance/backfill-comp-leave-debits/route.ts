import { NextRequest, NextResponse } from "next/server";
import { assertManagerAuth } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildCompLeaveDebitNote,
  resolveCompLeaveDebitHours,
} from "@/lib/attendance/compLeaveDebit";
import { roundCompLeaveHours } from "@/lib/attendance/compLeaveDisplay";
import { parseSiteId } from "@/lib/sites";
import { defaultStoreConfigForSite, parseStoreConfig } from "@/lib/store-config";

/**
 * 補登已核准但未扣補休的「補休假」申請（依請假日／審核時間先後）。
 * 可重複呼叫；已有 leave_debit 者略過。
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const body = (await req.json().catch(() => ({}))) as { site_id?: string };
    const siteId =
      auth.role === "boss" || auth.role === "owner"
        ? parseSiteId(body.site_id ?? auth.siteId)
        : auth.siteId;

    const { data: setting } = await admin
      .from("system_settings")
      .select("setting_value")
      .eq("id", `store_config_${siteId}`)
      .maybeSingle();
    const storeConfig = setting?.setting_value
      ? parseStoreConfig(setting.setting_value, siteId)
      : defaultStoreConfigForSite(siteId);
    const leaveHoursPerDay = storeConfig.policies.leaveHoursPerDay ?? 8;

    const { data: siteUsers, error: usersError } = await admin
      .from("users")
      .select("id")
      .eq("site_id", siteId);
    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }
    const siteUserIds = (siteUsers ?? []).map((u) => String(u.id));
    if (siteUserIds.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, skipped: 0 });
    }

    const { data: leaves, error: leaveError } = await admin
      .from("leave_applications")
      .select(
        "id, user_id, leave_date, end_date, leave_hours, period, reviewed_at, created_at, status, leave_type"
      )
      .eq("status", "approved")
      .eq("leave_type", "補休假")
      .in("user_id", siteUserIds)
      .order("leave_date", { ascending: true })
      .order("reviewed_at", { ascending: true })
      .order("created_at", { ascending: true });

    if (leaveError) {
      return NextResponse.json({ error: leaveError.message }, { status: 500 });
    }

    const leaveIds = (leaves ?? []).map((l) => String(l.id));
    const existingDebitIds = new Set<string>();
    if (leaveIds.length > 0) {
      const { data: existing, error: existingError } = await admin
        .from("comp_leave_ledger")
        .select("source_id")
        .eq("source_type", "leave_debit")
        .in("source_id", leaveIds);
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }
      for (const row of existing ?? []) {
        if (row.source_id) existingDebitIds.add(String(row.source_id));
      }
    }

    // 依序補扣：先算目前餘額（略過過期正數）
    const { data: ledgerRows, error: ledgerError } = await admin
      .from("comp_leave_ledger")
      .select("user_id, hours, expires_at")
      .in("user_id", siteUserIds);
    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }

    const now = Date.now();
    const balanceByUser = new Map<string, number>();
    for (const row of ledgerRows ?? []) {
      const uid = String(row.user_id);
      const hours = Number(row.hours);
      if (hours > 0 && row.expires_at && new Date(String(row.expires_at)).getTime() < now) {
        continue;
      }
      balanceByUser.set(uid, roundCompLeaveHours((balanceByUser.get(uid) ?? 0) + hours));
    }

    let inserted = 0;
    let skipped = 0;
    const details: Array<{ leaveId: string; hours: number; userId: string }> = [];

    for (const la of leaves ?? []) {
      const leaveId = String(la.id);
      if (existingDebitIds.has(leaveId)) {
        skipped += 1;
        continue;
      }

      const userId = String(la.user_id);
      const startDate = String(la.leave_date).slice(0, 10);
      const endDate = String(la.end_date ?? la.leave_date).slice(0, 10);
      const debitHours = resolveCompLeaveDebitHours({
        leaveHours: la.leave_hours == null ? null : Number(la.leave_hours),
        period: la.period,
        leaveHoursPerDay,
      });
      if (debitHours <= 0) {
        skipped += 1;
        continue;
      }

      const balanceBefore = balanceByUser.get(userId) ?? 0;
      const isAdvance = balanceBefore < debitHours;
      const createdAt = la.reviewed_at ?? la.created_at ?? new Date().toISOString();

      const { error: insertError } = await admin.from("comp_leave_ledger").insert({
        user_id: userId,
        hours: -debitHours,
        source_type: "leave_debit",
        source_id: leaveId,
        note: buildCompLeaveDebitNote({
          isAdvance,
          startDate,
          endDate,
          backfill: true,
        }),
        created_at: createdAt,
      });
      if (insertError) {
        return NextResponse.json(
          {
            error: `補扣失敗（${leaveId}）：${insertError.message}`,
            inserted,
            skipped,
          },
          { status: 500 }
        );
      }

      if (Number(la.leave_hours) <= 0 || la.leave_hours == null) {
        await admin.from("leave_applications").update({ leave_hours: debitHours }).eq("id", leaveId);
      }

      balanceByUser.set(userId, roundCompLeaveHours(balanceBefore - debitHours));
      existingDebitIds.add(leaveId);
      inserted += 1;
      details.push({ leaveId, hours: debitHours, userId });
    }

    return NextResponse.json({ ok: true, inserted, skipped, details });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "補扣失敗" },
      { status: 500 }
    );
  }
}
