import { describe, expect, it } from "vitest";
import {
  canEditSchedule,
  canManagePayroll,
  parseRoleCapabilityPolicy,
  parseUserCapabilities,
} from "@/lib/auth/permissions";
import { defaultStorePoliciesForSite } from "@/lib/store-policies";

describe("permissions", () => {
  const policies = defaultStorePoliciesForSite("zhushan");

  it("parses capabilities", () => {
    expect(parseUserCapabilities({ schedule: true, payroll: false })).toEqual({
      schedule: true,
      payroll: false,
    });
  });

  it("manager can schedule and payroll by default", () => {
    const actor = { role: "manager" as const };
    expect(canEditSchedule(actor, policies)).toBe(true);
    expect(canManagePayroll(actor, policies)).toBe(true);
  });

  it("staff needs grant for schedule", () => {
    expect(canEditSchedule({ role: "staff" }, policies)).toBe(false);
    expect(
      canEditSchedule({ role: "staff", capabilities: { schedule: true } }, policies)
    ).toBe(true);
  });

  it("payroll can be restricted to manager/owner only", () => {
    const restricted = {
      ...policies,
      roleCapabilities: parseRoleCapabilityPolicy({
        ...policies.roleCapabilities,
        payrollRoles: ["owner", "manager"],
        deputyLikeManager: true,
      }),
    };
    expect(canManagePayroll({ role: "deputy" }, restricted)).toBe(true); // deputyLike + manager in list
    const noDeputyLike = {
      ...policies,
      roleCapabilities: parseRoleCapabilityPolicy({
        payrollRoles: ["owner", "manager"],
        deputyLikeManager: false,
      }),
    };
    expect(canManagePayroll({ role: "deputy" }, noDeputyLike)).toBe(false);
    expect(
      canManagePayroll({ role: "staff", capabilities: { payroll: true } }, noDeputyLike)
    ).toBe(true);
  });
});
