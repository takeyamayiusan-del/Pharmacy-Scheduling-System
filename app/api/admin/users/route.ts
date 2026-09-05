import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { assertManagerOrCapability } from "@/lib/auth/server";
import { toAuthEmail, toDbRole } from "@/lib/auth/constants";

// GET /api/admin/users — list all active users
export async function GET(req: NextRequest) {
  const auth = await assertManagerOrCapability(req, "employees");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, username, name, role, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data });
}

// POST /api/admin/users — create new employee
export async function POST(req: NextRequest) {
  const auth = await assertManagerOrCapability(req, "employees");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { name, role, username, password } = body as {
    name: string;
    role: string;
    username: string;
    password: string;
  };

  if (!name || !role || !username || !password) {
    return NextResponse.json(
      { error: "name, role, username, password are required" },
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
    })
    .select()
    .single();

  if (insertError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ user: userRow }, { status: 201 });
}
