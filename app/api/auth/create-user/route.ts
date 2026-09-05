import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { assertManagerOrCapability } from "@/lib/auth/server";
import { toAuthEmail, toDbRole } from "@/lib/auth/constants";
import { filterDelegatableCapabilities, parseUserCapabilities } from "@/lib/auth/permissions";
import { fromDbRole } from "@/lib/auth/roles";
import {
  profileUpdatesFromBody,
  upsertEmployeeDependents,
  upsertEmployeeEmergencyContacts,
} from "@/lib/employees/profileServer";
import type { EmergencyContact, EmployeeDependent } from "@/lib/employees/profile";

// POST /api/auth/create-user
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerOrCapability(req, "employees");
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { username, password, name, role, hire_date, end_date, site_id } = body as {
      username: string;
      password: string;
      name: string;
      role: string;
      hire_date?: string;
      end_date?: string | null;
      site_id?: string;
      emergency_contacts?: EmergencyContact[];
      dependents?: EmployeeDependent[];
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

    const { data: existingByUsername } = await admin
      .from("users")
      .select("id")
      .eq("username", normalizedUsername)
      .maybeSingle();
    if (existingByUsername) {
      return NextResponse.json(
        { error: `登入帳號「${normalizedUsername}」已存在，請改用其他帳號` },
        { status: 409 }
      );
    }

    const { data: callerProfile } = await admin
      .from("users")
      .select("role, capabilities")
      .eq("id", auth.callerId)
      .single();
    const callerRole = fromDbRole(String(callerProfile?.role ?? ""));

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      const msg = authError.message || "";
      if (/already|registered|exists|duplicate/i.test(msg)) {
        return NextResponse.json(
          { error: `登入帳號「${normalizedUsername}」已存在，請改用其他帳號` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const siteId = site_id === "jiji" ? "jiji" : "zhushan";
    if (!["boss", "owner"].includes(auth.role) && siteId !== auth.siteId) {
      await admin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: "不可新增其他店的員工" }, { status: 403 });
    }
    const capabilities =
      body.capabilities && typeof body.capabilities === "object"
        ? filterDelegatableCapabilities(
            {
              role: callerRole,
              capabilities: parseUserCapabilities(callerProfile?.capabilities),
            },
            body.capabilities
          )
        : {};

    const { data: userRow, error: insertError } = await admin
      .from("users")
      .insert({
        id: authData.user.id,
        username: normalizedUsername,
        name,
        role: dbRole,
        is_active: true,
        hire_date: hire_date || "2026-04-01",
        end_date: end_date || null,
        site_id: siteId,
        work_hours_regime: body.work_hours_regime || null,
        baseline_shift: body.baseline_shift || null,
        is_half_day_leave_rule: Boolean(body.is_half_day_leave_rule),
        half_day_work_shift: body.half_day_work_shift || null,
        capabilities,
        ...profileUpdatesFromBody(body),
      })
      .select()
      .single();

    if (insertError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      const code = insertError.code || "";
      const msg = insertError.message || "";
      if (code === "23505" || /unique|duplicate/i.test(msg)) {
        if (/users_name_key|user_name_key|\(name\)/i.test(msg)) {
          return NextResponse.json(
            {
              error:
                "此姓名與現有員工重複（舊版資料庫限制同名）。請先套用最新 migration，或暫時在姓名後加區分字。",
            },
            { status: 409 }
          );
        }
        if (/username|users_username/i.test(msg)) {
          return NextResponse.json(
            { error: `登入帳號「${normalizedUsername}」已存在，請改用其他帳號` },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: "資料與現有員工衝突（重複鍵值），請確認帳號是否已使用" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    try {
      await upsertEmployeeEmergencyContacts(admin, authData.user.id, body.emergency_contacts);
      await upsertEmployeeDependents(admin, authData.user.id, body.dependents);
    } catch (relErr) {
      await admin.auth.admin.deleteUser(authData.user.id);
      await admin.from("users").delete().eq("id", authData.user.id);
      return NextResponse.json(
        { error: relErr instanceof Error ? relErr.message : "儲存聯絡人／眷屬失敗" },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: userRow }, { status: 201 });
  } catch (err) {
    console.error("[create-user]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
