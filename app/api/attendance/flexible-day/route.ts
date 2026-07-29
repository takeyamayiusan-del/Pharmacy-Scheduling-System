import { NextRequest, NextResponse } from "next/server";
import { assertManagerAuth } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  AttendeeShiftChoice,
  OriginalScheduleEntry,
  SettlementPreviewRow,
} from "@/lib/attendance/flexibleAttendance";
import {
  resolveTyphoonScheduleShift,
} from "@/lib/attendance/flexibleAttendance";
import type { ShiftTimeConfig, ShiftType } from "@/lib/context/AppContext";

type CreateBody = {
  action: "create";
  date: string;
  title?: string;
  periodMode: "full_day" | "from_time";
  fromTime?: string;
  note?: string;
  publishBulletin?: boolean;
  originalSchedule: OriginalScheduleEntry[];
};

type ConfirmAttendeesBody = {
  action: "confirm_attendees";
  dayId: string;
  expectedAttendeeIds: string[];
  /** 全日停班時：有來者的出勤時段選擇（userId → keep/full_day/morning/afternoon） */
  attendeeChoices?: Record<string, AttendeeShiftChoice>;
};

type SettleBody = {
  action: "settle";
  dayId: string;
  rows: SettlementPreviewRow[];
};

type ResolveBody = {
  action: "resolve_pending";
  pendingId: string;
  resolution: "comp_leave_deducted" | "makeup_assigned" | "manually_cleared";
  makeupDate?: string;
  note?: string;
};

type CancelBody = {
  action: "cancel";
  dayId: string;
};

type PurgeBody = {
  action: "purge_old_settled";
};

function formatTime(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/** 取消／重設時還原發布前的班表快照 */
async function restoreOriginalSchedule(
  admin: AdminClient,
  dayDate: string,
  originalSchedule: OriginalScheduleEntry[],
  updatedBy: string
) {
  for (const entry of originalSchedule) {
    const { error } = await admin.from("schedule_entries").upsert(
      {
        user_id: entry.userId,
        date: dayDate,
        shift_code: entry.shift,
        updated_by: updatedBy,
      },
      { onConflict: "user_id,date" }
    );
    if (error) throw new Error(error.message);
  }
}

async function archiveBulletin(admin: AdminClient, bulletinId: string | null | undefined) {
  if (!bulletinId) return;
  await admin
    .from("bulletin_board")
    .update({ status: "archived", is_pinned: false, is_urgent: false })
    .eq("id", bulletinId);
}

const DEFAULT_SHIFT_TIME_CONFIG: ShiftTimeConfig = {
  A: ["08:30-12:00", "13:30-17:00", "19:00-21:00"],
  B: ["08:30-12:00", "13:30-18:00"],
  C: ["08:30-12:00"],
  D: ["13:30-18:00"],
  E: ["13:30-17:00", "19:00-21:00"],
  X: ["休假"],
};

async function loadShiftTimeConfig(admin: AdminClient): Promise<ShiftTimeConfig> {
  const { data } = await admin
    .from("shift_time_config")
    .select("shift_code, time_ranges");
  if (!data?.length) return DEFAULT_SHIFT_TIME_CONFIG;
  const config: ShiftTimeConfig = { ...DEFAULT_SHIFT_TIME_CONFIG };
  for (const row of data) {
    const code = row.shift_code as ShiftType;
    if (Array.isArray(row.time_ranges) && row.time_ranges.length > 0) {
      config[code] = row.time_ranges as string[];
    }
  }
  return config;
}

/**
 * 清除「已取消」殘留，以及「上個月以前已結算」紀錄。
 * 補休帳本保留；若該日仍有未結清待補時數則暫不刪。
 */
async function purgeOldFlexibleDays(admin: AdminClient) {
  // 已取消：直接刪除，釋放 day_date 唯一鍵，才能重新設定
  await admin.from("flexible_attendance_days").delete().eq("status", "cancelled");

  const monthStart = currentMonthStart();
  const { data: oldSettled } = await admin
    .from("flexible_attendance_days")
    .select("id")
    .eq("status", "settled")
    .lt("day_date", monthStart);

  if (!oldSettled?.length) return { purgedSettled: 0 };

  let purgedSettled = 0;
  for (const day of oldSettled) {
    const { count } = await admin
      .from("pending_makeup_hours")
      .select("id", { count: "exact", head: true })
      .eq("source_day_id", day.id)
      .in("status", ["pending", "makeup_assigned"]);
    if ((count ?? 0) > 0) continue;

    const { error } = await admin.from("flexible_attendance_days").delete().eq("id", day.id);
    if (!error) purgedSettled += 1;
  }
  return { purgedSettled };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as
      | CreateBody
      | ConfirmAttendeesBody
      | SettleBody
      | ResolveBody
      | CancelBody
      | PurgeBody;
    const admin = createAdminClient();

    // 每次操作順便清掉已取消殘留、以及跨月已結算（補休帳本仍保留）
    if (body.action !== "settle") {
      await purgeOldFlexibleDays(admin);
    }

    if (body.action === "purge_old_settled") {
      const result = await purgeOldFlexibleDays(admin);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "create") {
      if (!body.date || !body.periodMode) {
        return NextResponse.json({ error: "請選擇日期與時段" }, { status: 400 });
      }
      if (body.periodMode === "from_time" && !body.fromTime) {
        return NextResponse.json({ error: "請選擇停班起始時間" }, { status: 400 });
      }
      if (!Array.isArray(body.originalSchedule)) {
        return NextResponse.json({ error: "缺少原班表快照" }, { status: 400 });
      }

      // 同日若尚有已取消殘留，先刪除以釋放唯一鍵
      await admin
        .from("flexible_attendance_days")
        .delete()
        .eq("day_date", body.date)
        .eq("status", "cancelled");

      const title = body.title?.trim() || "颱風／彈性出勤日";
      const periodLabel =
        body.periodMode === "full_day"
          ? "全日"
          : `${formatTime(body.fromTime)} 起`;

      const originallyOn = body.originalSchedule.filter((e) => e.shift !== "X");

      let bulletinId: string | null = null;
      if (body.publishBulletin !== false) {
        const content = [
          `日期：${body.date}`,
          `時段：${periodLabel}`,
          "請回覆店長：你是否願意／能夠在該時段出勤？",
          "規則：",
          "1. 當天本來就休假的人：完全不受影響。",
          "2. 有來打卡的人：結算後依實際打卡時數核發補休獎勵。",
          "3. 原本有排班但因颱風無法來的人：可擇日補班，或扣補休結清。",
          body.note?.trim() ? `備註：${body.note.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const { data: bulletin, error: bulletinError } = await admin
          .from("bulletin_board")
          .insert({
            author_id: auth.callerId,
            title: `【緊急】${title}（${body.date} ${periodLabel}）— 請回覆是否出勤`,
            content,
            type: "day_off_notice",
            status: "active",
            is_urgent: true,
            is_pinned: true,
            target_type: "all",
            target_ids: [],
          })
          .select("id")
          .single();

        if (bulletinError) {
          return NextResponse.json({ error: bulletinError.message }, { status: 500 });
        }
        bulletinId = bulletin.id;
      }

      const { data: day, error } = await admin
        .from("flexible_attendance_days")
        .insert({
          day_date: body.date,
          title,
          period_mode: body.periodMode,
          from_time: body.periodMode === "from_time" ? body.fromTime : null,
          note: body.note?.trim() || null,
          status: "announced",
          bulletin_id: bulletinId,
          original_schedule: body.originalSchedule,
          expected_attendee_ids: originallyOn.map((e) => e.userId),
          created_by: auth.callerId,
        })
        .select("*")
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json(
            { error: "該日期已有颱風／彈性出勤設定（含已結算）。請先取消未結算項目，或等下個月自動清除後再設。" },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ day, bulletinId });
    }

    if (body.action === "confirm_attendees") {
      if (!body.dayId || !Array.isArray(body.expectedAttendeeIds)) {
        return NextResponse.json({ error: "參數不完整" }, { status: 400 });
      }

      const { data: day, error: dayError } = await admin
        .from("flexible_attendance_days")
        .select("*")
        .eq("id", body.dayId)
        .single();

      if (dayError || !day) {
        return NextResponse.json({ error: "找不到彈性出勤日" }, { status: 404 });
      }
      if (day.status !== "announced") {
        return NextResponse.json({ error: "僅未結算的颱風日可確認出勤" }, { status: 400 });
      }

      const original = (day.original_schedule ?? []) as OriginalScheduleEntry[];
      const originallyOn = original.filter((e) => e.shift !== "X");
      const originallyOnIds = new Set(originallyOn.map((e) => e.userId));
      const expected = body.expectedAttendeeIds.filter((id) => originallyOnIds.has(id));
      const periodMode = day.period_mode as "full_day" | "from_time";
      const fromTime = formatTime(day.from_time);
      const shiftTimeConfig = await loadShiftTimeConfig(admin);
      const attendeeChoices = body.attendeeChoices ?? {};

      // 依班別 × 颱風時段 × 是否出席 更新班表
      for (const entry of originallyOn) {
        const willCome = expected.includes(entry.userId);
        const nextShift = resolveTyphoonScheduleShift({
          originalShift: entry.shift,
          willAttend: willCome,
          periodMode,
          fromTime,
          shiftTimeConfig,
          attendeeChoice: attendeeChoices[entry.userId] ?? "keep",
        });

        const { error: upsertError } = await admin.from("schedule_entries").upsert(
          {
            user_id: entry.userId,
            date: day.day_date,
            shift_code: nextShift,
            updated_by: auth.callerId,
          },
          { onConflict: "user_id,date" }
        );
        if (upsertError) {
          return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }
      }

      const { error: updateError } = await admin
        .from("flexible_attendance_days")
        .update({
          expected_attendee_ids: expected,
          attendees_confirmed_at: new Date().toISOString(),
        })
        .eq("id", body.dayId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, expectedCount: expected.length });
    }

    if (body.action === "settle") {
      if (!body.dayId || !Array.isArray(body.rows)) {
        return NextResponse.json({ error: "結算參數不完整" }, { status: 400 });
      }

      const { data: day, error: dayError } = await admin
        .from("flexible_attendance_days")
        .select("*")
        .eq("id", body.dayId)
        .single();

      if (dayError || !day) {
        return NextResponse.json({ error: "找不到彈性出勤日" }, { status: 404 });
      }
      if (day.status === "settled") {
        return NextResponse.json({ error: "此日已結算" }, { status: 400 });
      }
      if (day.status === "cancelled") {
        return NextResponse.json({ error: "此日已取消" }, { status: 400 });
      }

      const original = (day.original_schedule ?? []) as OriginalScheduleEntry[];
      const allowedIds = new Set(
        original.filter((e) => e.shift !== "X").map((e) => e.userId)
      );

      // 安全閘：只允許對「原本有排班」的人做核發／待補
      const safeRows = body.rows.filter(
        (row) =>
          allowedIds.has(row.userId) &&
          (row.outcome === "comp_leave_granted" || row.outcome === "pending_makeup")
      );

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 6);

      for (const row of safeRows) {
        const { error: resultError } = await admin.from("flexible_attendance_results").upsert(
          {
            day_id: body.dayId,
            user_id: row.userId,
            scheduled_shift: row.scheduledShift,
            affected_hours: row.affectedHours,
            actual_punch_hours: row.actualPunchHours,
            outcome: row.outcome,
            comp_leave_hours: row.grantHours,
            pending_hours: row.pendingHours,
            note:
              row.outcome === "comp_leave_granted"
                ? `實際打卡後核發補休 ${row.grantHours} 小時`
                : `原本有排班但未出勤，待補 ${row.pendingHours} 小時（可擇日補或扣補休）`,
          },
          { onConflict: "day_id,user_id" }
        );
        if (resultError) {
          return NextResponse.json({ error: resultError.message }, { status: 500 });
        }

        if (row.outcome === "comp_leave_granted" && row.grantHours > 0) {
          const { error: creditError } = await admin.from("comp_leave_ledger").insert({
            user_id: row.userId,
            hours: row.grantHours,
            source_type: "typhoon_credit",
            source_id: body.dayId,
            expires_at: expiresAt.toISOString(),
            note: `${day.title}（${day.day_date}）出勤補休獎勵`,
          });
          if (creditError) {
            return NextResponse.json({ error: creditError.message }, { status: 500 });
          }

          await admin.from("notifications").insert({
            recipient_id: row.userId,
            type: "info",
            title: "颱風日出勤補休已核發",
            body: `${day.day_date} 已依實際打卡核發補休 ${row.grantHours} 小時。`,
            related_type: "overtime",
            related_id: body.dayId,
            is_read: false,
          });
        }

        if (row.outcome === "pending_makeup" && row.pendingHours > 0) {
          const { error: pendingError } = await admin.from("pending_makeup_hours").insert({
            user_id: row.userId,
            source_day_id: body.dayId,
            source_date: day.day_date,
            hours: row.pendingHours,
            status: "pending",
            note: `${day.title}：原本有排班但因颱風未出勤`,
          });
          if (pendingError) {
            return NextResponse.json({ error: pendingError.message }, { status: 500 });
          }

          await admin.from("notifications").insert({
            recipient_id: row.userId,
            type: "warning",
            title: "颱風日待補時數",
            body: `${day.day_date} 原本有排班但未出勤，待補 ${row.pendingHours} 小時。請與店長確認：擇日補班或扣補休。`,
            related_type: "overtime",
            related_id: body.dayId,
            is_read: false,
          });
        }
      }

      const { error: settleError } = await admin
        .from("flexible_attendance_days")
        .update({
          status: "settled",
          settled_at: new Date().toISOString(),
          settled_by: auth.callerId,
        })
        .eq("id", body.dayId);

      if (settleError) {
        return NextResponse.json({ error: settleError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, processed: safeRows.length });
    }

    if (body.action === "resolve_pending") {
      if (!body.pendingId || !body.resolution) {
        return NextResponse.json({ error: "參數不完整" }, { status: 400 });
      }

      const { data: pending, error: pendingError } = await admin
        .from("pending_makeup_hours")
        .select("*")
        .eq("id", body.pendingId)
        .single();

      if (pendingError || !pending) {
        return NextResponse.json({ error: "找不到待補時數" }, { status: 404 });
      }
      if (pending.status !== "pending" && pending.status !== "makeup_assigned") {
        return NextResponse.json({ error: "此筆已結清" }, { status: 400 });
      }

      if (body.resolution === "comp_leave_deducted") {
        const { data: ledger } = await admin
          .from("comp_leave_ledger")
          .select("hours, expires_at")
          .eq("user_id", pending.user_id);

        const now = Date.now();
        const balance = (ledger ?? []).reduce((sum, row) => {
          const hours = Number(row.hours);
          if (hours > 0 && row.expires_at && new Date(row.expires_at).getTime() < now) {
            return sum;
          }
          return sum + hours;
        }, 0);

        if (balance < Number(pending.hours)) {
          return NextResponse.json(
            { error: `補休餘額不足（可用 ${Math.round(balance * 100) / 100} 小時）` },
            { status: 400 }
          );
        }

        const { error: debitError } = await admin.from("comp_leave_ledger").insert({
          user_id: pending.user_id,
          hours: -Number(pending.hours),
          source_type: "typhoon_debit",
          source_id: pending.source_day_id,
          note: `颱風日待補時數改扣補休（${pending.source_date}）`,
        });
        if (debitError) {
          return NextResponse.json({ error: debitError.message }, { status: 500 });
        }
      }

      if (body.resolution === "makeup_assigned" && !body.makeupDate) {
        return NextResponse.json({ error: "請指定補班日期" }, { status: 400 });
      }

      const { error: updateError } = await admin
        .from("pending_makeup_hours")
        .update({
          status: body.resolution,
          makeup_date: body.resolution === "makeup_assigned" ? body.makeupDate : null,
          resolved_at: new Date().toISOString(),
          resolved_by: auth.callerId,
          note: body.note?.trim() || pending.note,
        })
        .eq("id", body.pendingId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      const resolutionText =
        body.resolution === "comp_leave_deducted"
          ? `已扣除補休 ${pending.hours} 小時`
          : body.resolution === "makeup_assigned"
            ? `已指定補班日 ${body.makeupDate}`
            : "店長已手動結清";

      await admin.from("notifications").insert({
        recipient_id: pending.user_id,
        type: "info",
        title: "待補時數已處理",
        body: `${pending.source_date} 待補時數：${resolutionText}。`,
        related_type: "overtime",
        related_id: pending.source_day_id,
        is_read: false,
      });

      return NextResponse.json({ ok: true });
    }

    if (body.action === "cancel") {
      if (!body.dayId) {
        return NextResponse.json({ error: "缺少 dayId" }, { status: 400 });
      }

      const { data: day, error: dayError } = await admin
        .from("flexible_attendance_days")
        .select("*")
        .eq("id", body.dayId)
        .single();

      if (dayError || !day) {
        return NextResponse.json({ error: "找不到彈性出勤日" }, { status: 404 });
      }
      if (day.status === "settled") {
        return NextResponse.json(
          { error: "已結算的颱風日不可取消，紀錄會在下個月自動清除" },
          { status: 400 }
        );
      }

      const original = (day.original_schedule ?? []) as OriginalScheduleEntry[];

      // 若已改過班表（確認預計出勤），取消時還原快照
      if (day.attendees_confirmed_at) {
        try {
          await restoreOriginalSchedule(admin, day.day_date, original, auth.callerId);
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "還原班表失敗" },
            { status: 500 }
          );
        }
      }

      await archiveBulletin(admin, day.bulletin_id);

      // 刪除列以釋放 day_date UNIQUE，才能重新設定同日颱風假
      const { error: deleteError } = await admin
        .from("flexible_attendance_days")
        .delete()
        .eq("id", day.id);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, deleted: true });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("[flexible-day]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "操作失敗" },
      { status: 500 }
    );
  }
}
