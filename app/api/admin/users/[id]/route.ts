import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { assertManagerAuth } from "@/lib/auth/server";
import { PROTECTED_USERNAMES, toAuthEmail, toDbRole } from "@/lib/auth/constants";

// PATCH /api/admin/users/[id] — update employee
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await assertManagerAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;
  const body = await req.json();
  const { name, role, password, username } = body as {
    name?: string;
    role?: string;
    password?: string;
    username?: string;
  };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("users")
    .select("username")
    .eq("id", id)
    .single();

  if (username !== undefined) {
    const nextUsername = username.trim().toLowerCase();
    if (
      existing?.username &&
      PROTECTED_USERNAMES.has(existing.username) &&
      nextUsername !== existing.username
    ) {
      return NextResponse.json({ error: "無法變更系統預設管理者帳號" }, { status: 403 });
    }
  }

  const updates: Record<string, string> = {};
  if (name) updates.name = name;
  if (role) updates.role = toDbRole(role);
  if (username) updates.username = username.trim().toLowerCase();

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from("users").update(updates).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const authUpdates: Record<string, string> = {};
  if (password) authUpdates.password = password;
  if (username) authUpdates.email = toAuthEmail(username);

  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdates);
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  const { data: updated, error: fetchError } = await admin
    .from("users")
    .select("id, username, name, role, is_active, created_at, updated_at")
    .eq("id", id)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  return NextResponse.json({ user: updated });
}

// DELETE /api/admin/users/[id] — deactivate employee (soft delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await assertManagerAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;

  if (id === auth.callerId) {
    return NextResponse.json({ error: "無法停用自己的帳號" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("users")
    .select("username")
    .eq("id", id)
    .single();

  if (target?.username && PROTECTED_USERNAMES.has(target.username)) {
    return NextResponse.json({ error: "無法停用系統預設管理者帳號" }, { status: 403 });
  }

  const { error } = await admin.from("users").update({ is_active: false }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
