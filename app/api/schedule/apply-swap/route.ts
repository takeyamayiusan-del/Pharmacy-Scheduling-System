import { NextRequest, NextResponse } from "next/server";
import {
  assertManagerOrApprover,
  assertManagerCanAccessEmployee,
} from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { ScheduleSnapshotEntry } from "@/lib/schedule/scheduleSnapshot";
import { buildSwapShiftsAndChanges } from "@/lib/schedule/swapSchedule";
import { assertNoSundayInSwapDates } from "@/lib/schedule/sundayRest";
import { parseSiteId, storeConfigSettingId } from "@/lib/sites";
import { parseStoreConfig } from "@/lib/store-config";

type SwapAction = "approve" | "revert";

function schemaSnapshotError(message: string) {
  if (message.includes("schedule_snapshot")) {
    return "資料庫缺少 schedule_snapshot 欄位。請在 Ubuntu VM 執行：bash ~/Pharmacy-Scheduling-System/scripts/vm-apply-schedule-snapshot-migration.sh";
  }
  return message;
}

// POST /api/schedule/apply-swap
// Body: { swapId, action, snapshot? }
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerOrApprover(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as {
      swapId?: string;
      action?: SwapAction;
      snapshot?: ScheduleSnapshotEntry[];
    };

    const { swapId, action, snapshot } = body;
    if (!swapId || (action !== "approve" && action !== "revert")) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: swapRow, error: swapLoadError } = await admin
      .from("shift_swap_applications")
      .select("requester_id, target_id, swap_date, target_swap_date, schedule_snapshot")
      .eq("id", swapId)
      .maybeSingle();

    if (swapLoadError) {
      return NextResponse.json({ error: schemaSnapshotError(swapLoadError.message) }, { status: 500 });
    }
    if (!swapRow) {
      return NextResponse.json({ error: "找不到換班申請" }, { status: 404 });
    }

    const accessRequester = await assertManagerCanAccessEmployee(
      auth,
      swapRow.requester_id
    );
    if ("error" in accessRequester) {
      return NextResponse.json(
        { error: accessRequester.error },
        { status: accessRequester.status }
      );
    }
    if (swapRow.target_id) {
      const accessTarget = await assertManagerCanAccessEmployee(
        auth,
        swapRow.target_id
      );
      if ("error" in accessTarget) {
        return NextResponse.json(
          { error: accessTarget.error },
          { status: accessTarget.status }
        );
      }
    }

    if (action === "revert") {
      const storedSnapshot =
        (swapRow.schedule_snapshot as ScheduleSnapshotEntry[] | null) ?? snapshot ?? [];
      if (!storedSnapshot.length) {
        return NextResponse.json({ error: "找不到可還原的換班快照" }, { status: 400 });
      }

      for (const entry of storedSnapshot) {
        if (entry.hadDbEntry && entry.shift != null) {
          const { error } = await admin.from("schedule_entries").upsert(
            {
              user_id: entry.userId,
              date: entry.date,
              shift_code: entry.shift,
              updated_by: auth.callerId,
            },
            { onConflict: "user_id,date" }
          );
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        } else {
          const { error } = await admin
            .from("schedule_entries")
            .delete()
            .eq("user_id", entry.userId)
            .eq("date", entry.date);
          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }

      const { error: clearError } = await admin
        .from("shift_swap_applications")
        .update({ schedule_snapshot: null })
        .eq("id", swapId);
      if (clearError) {
        return NextResponse.json({ error: schemaSnapshotError(clearError.message) }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "revert", snapshot: storedSnapshot });
    }

    if (!snapshot?.length) {
      return NextResponse.json({ error: "核准換班需提供班表快照" }, { status: 400 });
    }

    const swapRequest = {
      requesterId: swapRow.requester_id,
      targetEmployeeId: swapRow.target_id,
      requesterDate: swapRow.swap_date,
      targetDate: swapRow.target_swap_date || swapRow.swap_date,
    };

    const { data: requesterRow } = await admin
      .from("users")
      .select("site_id")
      .eq("id", swapRow.requester_id)
      .maybeSingle();
    const siteId = parseSiteId(requesterRow?.site_id ?? auth.siteId);
    const { data: setting } = await admin
      .from("app_settings")
      .select("value")
      .eq("id", storeConfigSettingId(siteId))
      .maybeSingle();
    const storeConfig = parseStoreConfig(setting?.value, siteId);
    const sundayFixedRest = storeConfig.policies.sundayFixedRest;

    const sundayGuard = assertNoSundayInSwapDates(
      swapRequest.requesterDate,
      swapRequest.targetDate,
      sundayFixedRest
    );
    if (!sundayGuard.ok) {
      return NextResponse.json({ error: sundayGuard.message }, { status: 400 });
    }

    let changes;
    try {
      ({ changes } = buildSwapShiftsAndChanges(swapRequest, snapshot, sundayFixedRest));
    } catch (err) {
      const message = err instanceof Error ? err.message : "換班班表計算失敗";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    for (const change of changes) {
      const { error } = await admin.from("schedule_entries").upsert(
        {
          user_id: change.userId,
          date: change.date,
          shift_code: change.shift,
          updated_by: auth.callerId,
        },
        { onConflict: "user_id,date" }
      );
      if (error) {
        console.error("[apply-swap] upsert:", change, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const { error: snapshotError } = await admin
      .from("shift_swap_applications")
      .update({ schedule_snapshot: snapshot })
      .eq("id", swapId);
    if (snapshotError) {
      return NextResponse.json({ error: schemaSnapshotError(snapshotError.message) }, { status: 500 });
    }

    return NextResponse.json({ success: true, action: "approve", snapshot, changes });
  } catch (err) {
    console.error("[apply-swap]", err);
    return NextResponse.json({ error: "換班班表更新失敗" }, { status: 500 });
  }
}
