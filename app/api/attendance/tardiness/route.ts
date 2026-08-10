import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  assertManagerAuth,
  assertManagerCanAccessEmployee,
} from "@/lib/auth/server";

export async function DELETE(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { id, match } = body as {
      id?: string;
      match?: {
        employeeId: string;
        date: string;
        minutes?: number;
        notes?: string;
      };
    };

    if (!id && !match) {
      return NextResponse.json({ error: "id or match is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    if (id) {
      const { data: existing, error: lookupError } = await admin
        .from("tardiness_records")
        .select("user_id")
        .eq("id", id)
        .maybeSingle();

      if (lookupError) {
        return NextResponse.json({ error: lookupError.message }, { status: 500 });
      }
      if (!existing) {
        return NextResponse.json({ error: "找不到遲到紀錄" }, { status: 404 });
      }

      const access = await assertManagerCanAccessEmployee(auth, existing.user_id);
      if ("error" in access) {
        return NextResponse.json({ error: access.error }, { status: access.status });
      }
    } else if (match) {
      const access = await assertManagerCanAccessEmployee(auth, match.employeeId);
      if ("error" in access) {
        return NextResponse.json({ error: access.error }, { status: access.status });
      }
    }

    let query = admin.from("tardiness_records").delete();

    if (id) {
      query = query.eq("id", id);
    } else if (match) {
      query = query.eq("user_id", match.employeeId).eq("record_date", match.date);
      if (typeof match.minutes === "number") query = query.eq("minutes_late", match.minutes);
      if (match.notes) query = query.eq("note", match.notes);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[attendance/tardiness DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
