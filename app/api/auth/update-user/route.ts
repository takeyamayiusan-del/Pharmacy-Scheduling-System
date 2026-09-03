import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { assertManagerOrCapability } from "@/lib/auth/server";
import { PROTECTED_USERNAMES, toAuthEmail, toDbRole } from "@/lib/auth/constants";
import { filterDelegatableCapabilities, parseUserCapabilities } from "@/lib/auth/permissions";
import { fromDbRole } from "@/lib/auth/roles";
import {
  profileUpdatesFromBody,
  upsertEmployeeDependents,
  upsertEmployeeEmergencyContacts,
} from "@/lib/employees/profileServer";
import type { EmergencyContact, EmployeeDependent } from "@/lib/employees/profile";

// POST /api/auth/update-user
// Body: { userId, password?, name?, role?, username?, ... }
export async function POST(req: NextRequest) {
  try {
    const auth = await assertManagerOrCapability(req, "employees");
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const {
      userId,
      password,
      name,
      role,
      username,
      isWednesdayRotation,
      isWeekdayOffRule,
      isHalfDayLeaveRule,
      halfDayWorkShift,
      hire_date,
      end_date,
      site_id,
      work_hours_regime,
      baseline_shift,
      capabilities,
      emergency_contacts,
      dependents,
    } = body as {
      userId: string;
      password?: string;
      name?: string;
      role?: string;
      username?: string;
      isWednesdayRotation?: boolean;
      isWeekdayOffRule?: boolean;
      isHalfDayLeaveRule?: boolean;
      halfDayWorkShift?: string | null;
      hire_date?: string;
      end_date?: string | null;
      site_id?: string;
      work_hours_regime?: string | null;
      baseline_shift?: string | null;
      capabilities?: Record<string, boolean> | null;
      national_id?: string | null;
      birth_date?: string | null;
      gender?: string | null;
      registered_address?: string | null;
      mailing_address?: string | null;
      mailing_same_as_registered?: boolean;
      phone?: string | null;
      emergency_contacts?: EmergencyContact[];
      dependents?: EmployeeDependent[];
    };

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: callerProfile } = await admin
      .from("users")
      .select("role, site_id, capabilities")
      .eq("id", auth.callerId)
      .single();
    const callerRole = fromDbRole(String(callerProfile?.role ?? ""));

    const { data: existing } = await admin
      .from("users")
      .select("username")
      .eq("id", userId)
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

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) {
      const nextRole = toDbRole(role);
      if (callerRole !== "owner" && nextRole === "boss") {
        return NextResponse.json({ error: "僅老闆可設定老闆角色" }, { status: 403 });
      }
      updates.role = nextRole;
    }
    if (isWednesdayRotation !== undefined) updates.is_wednesday_rotation = isWednesdayRotation;
    if (isWeekdayOffRule !== undefined) updates.is_weekday_off_rule = isWeekdayOffRule;
    if (isHalfDayLeaveRule !== undefined) updates.is_half_day_leave_rule = isHalfDayLeaveRule;
    if (halfDayWorkShift !== undefined) updates.half_day_work_shift = halfDayWorkShift || null;
    if (hire_date !== undefined) updates.hire_date = hire_date;
    if (end_date !== undefined) updates.end_date = end_date || null;
    if (username !== undefined) updates.username = username.trim().toLowerCase();
    if (site_id !== undefined) {
      updates.site_id = site_id === "jiji" ? "jiji" : "zhushan";
    }
    if (work_hours_regime !== undefined) updates.work_hours_regime = work_hours_regime || null;
    if (baseline_shift !== undefined) updates.baseline_shift = baseline_shift || null;
    if (capabilities !== undefined) {
      if (callerRole !== "owner") {
        // 非老闆不可改授權，略過以免誤寫空物件清掉既有權限
      } else {
        updates.capabilities = filterDelegatableCapabilities(
          {
            role: callerRole,
            capabilities: parseUserCapabilities(callerProfile?.capabilities),
          },
          capabilities && typeof capabilities === "object" ? capabilities : {}
        );
      }
    }
    Object.assign(updates, profileUpdatesFromBody(body as Record<string, unknown>));

    if (Object.keys(updates).length > 0) {
      const { error } = await admin.from("users").update(updates).eq("id", userId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    try {
      await upsertEmployeeEmergencyContacts(admin, userId, emergency_contacts);
      await upsertEmployeeDependents(admin, userId, dependents);
    } catch (relErr) {
      return NextResponse.json(
        { error: relErr instanceof Error ? relErr.message : "儲存聯絡人／眷屬失敗" },
        { status: 500 }
      );
    }

    const authUpdates: { password?: string; email?: string } = {};
    if (password) authUpdates.password = password;
    if (username) authUpdates.email = toAuthEmail(username);

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await admin.auth.admin.updateUserById(userId, authUpdates);
      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 });
      }
    }

    const { data: updated, error: fetchError } = await admin
      .from("users")
      .select(
        "id, username, name, role, is_active, is_wednesday_rotation, is_weekday_off_rule, is_half_day_leave_rule, half_day_work_shift, hire_date, end_date, site_id, created_at, updated_at"
      )
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
