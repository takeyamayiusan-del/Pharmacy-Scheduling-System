import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { assertManagerAuth } from "@/lib/auth/server";
import { toAuthEmail, toDbRole } from "@/lib/auth/constants";

// POST /api/auth/create-user
// Body: { username, password, name, role, hire_date? }
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerAuth(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

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

    const normalizedUsername = username.trim().toLowerCase();
    const email = toAuthEmail(normalizedUsername);
    const admin = createAdminClient();
    const dbRole = toDbRole(role);

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const { data: userRow, error: insertError } = await admin
      .from("users")
      .insert({
        id: authData.user.id,
        username: normalizedUsername,
        name,
        role: dbRole,
        is_active: true,
        hire_date: hire_date || "2026-04-01",
      })
      .select()
      .single();

    if (insertError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ user: userRow }, { status: 201 });
  } catch (err) {
    console.error("[create-user]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
