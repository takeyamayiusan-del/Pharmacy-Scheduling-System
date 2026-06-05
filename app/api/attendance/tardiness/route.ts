import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest) {
  try {
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
