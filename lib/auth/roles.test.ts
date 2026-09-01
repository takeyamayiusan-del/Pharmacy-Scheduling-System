import { describe, expect, it } from "vitest";
import {
  APP_ROLE_LABELS,
  fromDbRole,
  isStaffLikeRole,
  managerPortalDbRoles,
  toDbRole,
} from "@/lib/auth/roles";

describe("roles", () => {
  it("maps director between app and db", () => {
    expect(toDbRole("director")).toBe("director");
    expect(fromDbRole("director")).toBe("director");
    expect(APP_ROLE_LABELS.director).toBe("主任");
  });

  it("treats director as staff-like", () => {
    expect(isStaffLikeRole("director")).toBe(true);
    expect(isStaffLikeRole("staff")).toBe(true);
    expect(isStaffLikeRole("manager")).toBe(false);
  });

  it("includes director in manager portal login roles", () => {
    expect(managerPortalDbRoles()).toContain("director");
    expect(managerPortalDbRoles()).not.toContain("employee");
  });
});
