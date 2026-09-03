import { describe, expect, it } from "vitest";
import { organizationAccessAllows, type OrganizationAccess } from "./organization-access";

const access = (
  organizationRole: OrganizationAccess["organizationRole"],
  platformRole: OrganizationAccess["platformRole"] = null,
): OrganizationAccess => ({ organizationRole, platformRole });

describe("organizationAccessAllows", () => {
  it("rejects a user without an active tenant membership", () => {
    expect(organizationAccessAllows(access(null), ["owner", "admin"])).toBe(false);
  });

  it("does not let a tenant admin perform owner-only actions", () => {
    expect(organizationAccessAllows(access("admin"), ["owner"])).toBe(false);
  });

  it("allows active tenant roles only when explicitly accepted", () => {
    expect(organizationAccessAllows(access("owner"), ["owner"])).toBe(true);
    expect(organizationAccessAllows(access("admin"), ["owner", "admin"])).toBe(true);
  });

  it("does not give the platform developer an implicit tenant bypass", () => {
    expect(organizationAccessAllows(access(null, "developer"), ["owner"])).toBe(false);
  });

  it("allows a platform role only when the operation explicitly opts in", () => {
    expect(organizationAccessAllows(access(null, "developer"), ["owner"], ["developer"])).toBe(
      true,
    );
  });

  it("does not give platform support an implicit tenant bypass", () => {
    expect(organizationAccessAllows(access(null, "support"), ["owner", "admin"])).toBe(false);
  });
});
