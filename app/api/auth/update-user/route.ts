import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/auth/update-user
// Body: { userId, password?, name?, role? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, password, name, role } = body as {
      userId: string;
      password?: string;
      name?: string;
      role?: string;
    };

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Update public.users if name or role provided
    if (name !== undefined || role !== undefined) {
      const updates: Record<string, string> = {};
      if (name) updates.name = name;
      if (role) {
        // Map AppContext role to Supabase role
        updates.role = role === "staff" ? "employee" : role === "owner" ? "boss" : role;
      }

      const { error } = await admin.from("users").update(updates).eq("id", userId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Update password in auth.users if provided
    if (password) {
      const { error: authError } = await admin.auth.admin.updateUserById(userId, {
        password,
      });
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }
    }

    const { data: updated, error: fetchError } = await admin
      .from("users")
      .select("id, name, role, is_active, created_at, updated_at")
      .eq("id", userId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error("[update-user]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
