import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { assertManagerOrCapability } from "@/lib/auth/server";
import { parseSiteId } from "@/lib/sites";
import { parseUserCapabilities } from "@/lib/auth/permissions";

function siteFilterForAuth(auth: { role: string; siteId: string }) {
  if (auth.role === "owner" || auth.role === "boss") return null;
  return auth.siteId;
}

export async function GET(req: NextRequest) {
  const auth = await assertManagerOrCapability(req, "employees");
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const siteId = siteFilterForAuth(auth);

  let query = admin
    .from("users")
    .select(
      "id, name, role, hire_date, end_date, is_active, site_id, work_hours_regime, baseline_shift, capabilities"
    )
    .neq("role", "owner")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (siteId) {
    query = query.eq("site_id", siteId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    employees: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      hireDate: row.hire_date,
      endDate: row.end_date,
      isActive: row.is_active,
      siteId: parseSiteId(row.site_id),
      workHoursRegime: row.work_hours_regime,
      baselineShift: row.baseline_shift,
      capabilities: parseUserCapabilities(row.capabilities),
    })),
  });
}
