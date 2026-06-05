import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// POST /api/auth/create-user
// Body: { username, password, name, role }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, name, role, hire_date } = body as {
      username: string;
      password: string;
      name: string;
      role: string;
      hire_date?: string;
    };

    if (!username || !password || !name || !role) {
      return NextResponse.json(
        { error: "username, password, name, role are required" },
        { status: 400 }
      );
    }

    const email = `${username.trim().toLowerCase()}@yaosheng.app`;
    const admin = createAdminClient();

    // Map AppContext role to Supabase role
    const dbRole = role === "staff" ? "employee" : role === "owner" ? "boss" : role;

    // Create auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Insert into public.users
    const { data: userRow, error: insertError } = await admin
      .from("users")
      .insert({
        id: authData.user.id,
        name,
        role: dbRole,
        is_active: true,
        hire_date: hire_date || "2026-04-01",
      })
      .select()
      .single();

    if (insertError) {
      // Rollback auth user if public.users insert fails
      await admin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ user: userRow }, { status: 201 });
  } catch (err) {
    console.error("[create-user]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
