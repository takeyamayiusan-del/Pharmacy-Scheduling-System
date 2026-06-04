import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/auth/delete-user
// Body: { userId }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body as { userId: string };

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Delete from auth.users — CASCADE will remove public.users row too
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete-user]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
