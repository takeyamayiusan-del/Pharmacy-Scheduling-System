import type { WorkHoursRegime } from "@/lib/attendance/workHoursRegime";
import { isWorkHoursRegime } from "@/lib/attendance/workHoursRegime";
import type { StoreConfig } from "@/lib/store-config";
import type { StorePolicies } from "@/lib/store-policies";
import { normalizeCycleAnchor } from "@/lib/attendance/deformedHoursSoftWarnings";

export type RegimeEmployee = {
  workHoursRegime?: WorkHoursRegime | string | null;
  hireDate?: string | null;
};

/** 個人制度優先，空則跟店 */
export function resolveEmployeeWorkHoursRegime(
  employee: RegimeEmployee | null | undefined,
  storeConfig: StoreConfig
): WorkHoursRegime {
  const personal = employee?.workHoursRegime;
  if (isWorkHoursRegime(personal)) return personal;
  return storeConfig.workHoursRegime;
}

/** 店規開啟「從入職日起算」且有入職日時，用入職日當週期錨點 */
export function resolveEmployeeCycleAnchor(
  employee: RegimeEmployee | null | undefined,
  storeConfig: StoreConfig,
  policies?: StorePolicies
): string {
  const fromHire = policies?.workHoursCycleFromHireDate ?? storeConfig.policies.workHoursCycleFromHireDate;
  const hire = employee?.hireDate?.trim();
  if (fromHire && hire && /^\d{4}-\d{2}-\d{2}$/.test(hire)) {
    return hire;
  }
  return normalizeCycleAnchor(storeConfig.workHoursCycleAnchor);
}
