import { fromDbRole } from "@/lib/auth/roles";
import { effectiveApprovalChain, shouldNotifyApprover } from "@/lib/approvals/chain";
import { parseUserCapabilities } from "@/lib/auth/permissions";
import { parseSiteId, storeConfigSettingId, type SiteId } from "@/lib/sites";
import { parseStoreConfig } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/server";
import type { ApprovalMode, ApprovalStepRole, AppRole } from "@/lib/auth/roles";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ApprovalEmployee = {
  id: string;
  role: AppRole;
  siteId: SiteId;
  name: string;
  capabilities: ReturnType<typeof parseUserCapabilities>;
};

export async function loadApprovalContext(admin: AdminClient, siteId: SiteId) {
  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("id", storeConfigSettingId(siteId))
    .maybeSingle();
  const storeConfig = parseStoreConfig(setting?.value, siteId);
  const { data: staffRows } = await admin
    .from("users")
    .select("id, role, site_id, name, is_active, capabilities")
    .eq("is_active", true);
  const employees: ApprovalEmployee[] = (staffRows ?? []).map((u) => ({
    id: u.id as string,
    role: fromDbRole(String(u.role)),
    siteId: parseSiteId(u.site_id),
    name: String(u.name ?? ""),
    capabilities: parseUserCapabilities(u.capabilities),
  }));
  const chain = effectiveApprovalChain(
    storeConfig.policies.approvalChain,
    employees,
    siteId
  );
  return { storeConfig, employees, chain, approvalMode: storeConfig.policies.approvalMode };
}

/** 審核關卡推進時通知清單（含 approve 授權者） */
export function filterAdvanceNotifyRecipients(input: {
  employees: ApprovalEmployee[];
  siteId: SiteId;
  notifyRoles: AppRole[];
  mode: ApprovalMode;
  requiredRole: ApprovalStepRole;
}): ApprovalEmployee[] {
  return input.employees.filter((e) => {
    const sameSite = e.role === "owner" || e.siteId === input.siteId;
    if (!sameSite) return false;
    return shouldNotifyApprover({
      employee: e,
      notifyRoles: input.notifyRoles,
      mode: input.mode,
      requiredRole: input.requiredRole,
    });
  });
}
