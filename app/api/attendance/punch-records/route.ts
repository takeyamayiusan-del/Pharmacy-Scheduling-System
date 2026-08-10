import { NextRequest, NextResponse } from "next/server";
import {
  assertManagerAuth,
  assertManagerCanAccessEmployee,
} from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/server";

type PunchAction = "work_in" | "work_out";

type PunchRecordInput = {
  employeeId: string;
  employeeName: string;
  date: string;
  action: PunchAction;
  segmentIndex: number;
  time: string;
  shift: string;
  lateMinutes: number;
  reason?: string | null;
  latitude?: number;
  longitude?: number;
};

type PunchRecordUpdate = {
  time?: string;
  action?: PunchAction;
  segmentIndex?: number;
  lateMinutes?: number;
  reason?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as { record?: PunchRecordInput };
    const record = body.record;
    if (!record?.employeeId || !record.date || !record.time) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }

    const access = await assertManagerCanAccessEmployee(auth, record.employeeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("punch_records")
      .insert({
        employee_id: record.employeeId,
        employee_name: record.employeeName,
        date: record.date,
        action: record.action,
        segment_index: record.segmentIndex,
        time: record.time,
        shift: record.shift,
        late_minutes: record.lateMinutes,
        reason: record.reason ?? null,
        latitude: record.latitude ?? 0,
        longitude: record.longitude ?? 0,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error("[attendance/punch-records POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as { id?: string; updates?: PunchRecordUpdate };
    const { id, updates } = body;
    if (!id || !updates) {
      return NextResponse.json({ error: "參數不完整" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing, error: lookupError } = await admin
      .from("punch_records")
      .select("employee_id")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "找不到打卡紀錄" }, { status: 404 });
    }

    const access = await assertManagerCanAccessEmployee(auth, existing.employee_id);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const dbUpdates: Record<string, unknown> = {};
    if (updates.time !== undefined) dbUpdates.time = updates.time;
    if (updates.action !== undefined) dbUpdates.action = updates.action;
    if (updates.segmentIndex !== undefined) dbUpdates.segment_index = updates.segmentIndex;
    if (updates.lateMinutes !== undefined) dbUpdates.late_minutes = updates.lateMinutes;
    if (updates.reason !== undefined) dbUpdates.reason = updates.reason;

    const { error } = await admin.from("punch_records").update(dbUpdates).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[attendance/punch-records PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing, error: lookupError } = await admin
      .from("punch_records")
      .select("employee_id")
      .eq("id", body.id)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "找不到打卡紀錄" }, { status: 404 });
    }

    const access = await assertManagerCanAccessEmployee(auth, existing.employee_id);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { error } = await admin.from("punch_records").delete().eq("id", body.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[attendance/punch-records DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
