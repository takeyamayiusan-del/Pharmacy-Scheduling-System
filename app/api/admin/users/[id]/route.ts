import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/server";

// Helper: verify the caller is a logged-in manager or boss
async function assertManagerAuth() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: "Unauthorized", status: 401 };
  }

  const admin = createAdminClient();
  const { data: user, error } = await admin
    .from("users")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (error || !user || !["boss", "manager"].includes(user.role)) {
    return { error: "Forbidden", status: 403 };
  }

  return { callerId: session.user.id };
}

// PATCH /api/admin/users/[id] — update employee name, role, or password
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await assertManagerAuth();
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

  // Update public.users fields if provided
  if (name !== undefined || role !== undefined) {
    const updates: Record<string, string> = {};
    if (name) updates.name = name;
    if (role) updates.role = role;

    const { error } = await admin.from("users").update(updates).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Update password and/or email in auth.users if provided
  if (password || username) {
    const authUpdates: Record<string, string> = {};
    if (password) authUpdates.password = password;
    if (username) {
      authUpdates.email = `${username.trim().toLowerCase()}@yaosheng.local`;
    }

    const { error: authError } = await admin.auth.admin.updateUserById(
      id,
      authUpdates
    );
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  const { data: updated, error: fetchError } = await admin
    .from("users")
    .select("id, name, role, is_active, created_at, updated_at")
    .eq("id", id)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  return NextResponse.json({ user: updated });
}

// DELETE /api/admin/users/[id] — deactivate employee (soft delete)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await assertManagerAuth();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = params;
  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
