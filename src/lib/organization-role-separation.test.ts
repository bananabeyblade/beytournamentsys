import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../database/migrations/0027_separate_platform_and_organization_roles.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("platform and organization role separation", () => {
  it("removes only the temporary Google organization-owner superadmin bridge", () => {
    expect(migration).toContain("legacy_role.role = 'superadmin'::app_role");
    expect(migration).toContain("account.google_subject IS NOT NULL");
    expect(migration).toContain("membership.role = 'owner'::organization_member_role");
    expect(migration).toContain("membership.status = 'active'::organization_member_status");
  });

  it("preserves the fixed platform owner and leaves platform roles untouched", () => {
    expect(migration).toContain("lower(account.email) <> 'john410403123@gmail.com'");
    expect(migration).not.toContain("DELETE FROM platform_roles");
  });
});
