import type { AppRole, ApprovalMode, ApprovalStepRole } from "@/lib/auth/roles";
import { APPROVAL_STEP_LABELS } from "@/lib/auth/roles";

export type ApprovalDecision =
  | { kind: "reject" }
  | { kind: "advance"; nextStep: number; nextRole: ApprovalStepRole }
  | { kind: "final" };

/** 關卡中沒有對應人員時略過（例如尚未建副店帳號） */
export function effectiveApprovalChain(
  chain: ApprovalStepRole[],
  employees: Array<{ role?: string | null; siteId?: string | null }>,
  siteId?: string | null
): ApprovalStepRole[] {
  const list = chain.length > 0 ? chain : (["manager"] as ApprovalStepRole[]);
  const filtered = list.filter((role) => {
    if (role === "owner") {
      return employees.some((e) => e.role === "owner");
    }
    return employees.some(
      (e) =>
        e.role === role &&
        (siteId == null || e.siteId == null || e.siteId === siteId)
    );
  });
  return filtered.length > 0 ? filtered : (["manager"] as ApprovalStepRole[]);
}

export function currentApprovalRole(
  chain: ApprovalStepRole[],
  step: number
): ApprovalStepRole {
  const idx = Math.max(0, Math.min(step, chain.length - 1));
  return chain[idx] ?? "manager";
}

export function approvalPendingLabel(
  chain: ApprovalStepRole[],
  step: number,
  mode: ApprovalMode = "sequential"
): string {
  if (mode === "any") return "待店長／副店／老闆審核";
  const role = currentApprovalRole(chain, step);
  return `待${APPROVAL_STEP_LABELS[role]}審核`;
}

/**
 * sequential：老闆可代任何關卡，其餘須對應當前關卡。
 * any：店長／副店／老闆誰來都能審。
 */
export function canActOnApprovalStep(
  actorRole: AppRole | string | null | undefined,
  required: ApprovalStepRole,
  mode: ApprovalMode = "sequential"
): boolean {
  if (mode === "any") {
    return actorRole === "owner" || actorRole === "manager" || actorRole === "deputy";
  }
  if (actorRole === "owner") return true;
  return actorRole === required;
}

export function resolveApprovalDecision(
  chain: ApprovalStepRole[],
  currentStep: number,
  action: "approved" | "rejected" | "pending",
  mode: ApprovalMode = "sequential"
): ApprovalDecision | { kind: "pending" } {
  if (action === "pending") return { kind: "pending" };
  if (action === "rejected") return { kind: "reject" };
  if (mode === "any") return { kind: "final" };
  const step = Math.max(0, currentStep);
  if (step >= chain.length - 1) return { kind: "final" };
  const nextStep = step + 1;
  return {
    kind: "advance",
    nextStep,
    nextRole: currentApprovalRole(chain, nextStep),
  };
}

export function rolesToNotify(
  role: ApprovalStepRole,
  mode: ApprovalMode = "sequential"
): AppRole[] {
  if (mode === "any") return ["manager", "deputy", "owner"];
  if (role === "owner") return ["owner"];
  if (role === "deputy") return ["deputy"];
  return ["manager"];
}
