import { fromDbRole } from "@/lib/auth/roles";
import { effectiveApprovalChain } from "@/lib/approvals/chain";
import { parseSiteId, storeConfigSettingId, type SiteId } from "@/lib/sites";
import { parseStoreConfig } from "@/lib/store-config";
import { createAdminClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function loadApprovalContext(admin: AdminClient, siteId: SiteId) {
  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("id", storeConfigSettingId(siteId))
    .maybeSingle();
  const storeConfig = parseStoreConfig(setting?.value, siteId);
  const { data: staffRows } = await admin
    .from("users")
    .select("id, role, site_id, name, is_active")
    .eq("is_active", true);
  const employees = (staffRows ?? []).map((u) => ({
    id: u.id as string,
    role: fromDbRole(String(u.role)),
    siteId: parseSiteId(u.site_id),
    name: String(u.name ?? ""),
  }));
  const chain = effectiveApprovalChain(
    storeConfig.policies.approvalChain,
    employees,
    siteId
  );
  return { storeConfig, employees, chain, approvalMode: storeConfig.policies.approvalMode };
}
