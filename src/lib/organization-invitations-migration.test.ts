import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../database/migrations/0028_organization_google_invitations.sql", import.meta.url),
  "utf8",
);

describe("organization invitation migration", () => {
  it("scopes every invitation to one organization and one normalized email", () => {
    expect(migration).toContain(
      "organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE",
    );
    expect(migration).toContain("email = lower(btrim(email))");
    expect(migration).toContain("UNIQUE (organization_id, email)");
  });

  it("limits invitations to organization admins and keeps the table backend-only", () => {
    expect(migration).toContain("organization_invitations_admin_only CHECK (role = 'admin')");
    expect(migration).toContain("REVOKE ALL ON TABLE organization_invitations FROM PUBLIC");
  });
});
