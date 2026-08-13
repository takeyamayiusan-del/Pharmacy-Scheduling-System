import { describe, expect, it } from "vitest";
import {
  canActOnApprovalStep,
  effectiveApprovalChain,
  resolveApprovalDecision,
} from "@/lib/approvals/chain";

describe("approval chain", () => {
  it("略過店內沒有的角色", () => {
    const chain = effectiveApprovalChain(
      ["manager", "deputy", "owner"],
      [
        { role: "manager", siteId: "jiji" },
        { role: "owner", siteId: "zhushan" },
      ],
      "jiji"
    );
    expect(chain).toEqual(["manager", "owner"]);
  });

  it("店長核准後進入下一關，最後一關才結案", () => {
    const chain = ["manager", "deputy", "owner"] as const;
    expect(resolveApprovalDecision([...chain], 0, "approved")).toEqual({
      kind: "advance",
      nextStep: 1,
      nextRole: "deputy",
    });
    expect(resolveApprovalDecision([...chain], 2, "approved")).toEqual({ kind: "final" });
    expect(resolveApprovalDecision([...chain], 1, "rejected")).toEqual({ kind: "reject" });
  });

  it("老闆可代任何關卡，副店不可代店長關", () => {
    expect(canActOnApprovalStep("owner", "manager")).toBe(true);
    expect(canActOnApprovalStep("deputy", "manager")).toBe(false);
    expect(canActOnApprovalStep("deputy", "deputy")).toBe(true);
  });
});
