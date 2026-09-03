import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../database/migrations/0024_multi_tenant_foundation.sql", import.meta.url),
  "utf8",
);

describe("multi-tenant foundation migration", () => {
  it("prevents tournaments and audit rows from becoming unowned", () => {
    expect(migration).toMatch(
      /ALTER TABLE tournaments[\s\S]*ALTER COLUMN organization_id SET NOT NULL/,
    );
    expect(migration).toMatch(
      /ALTER TABLE admin_actions[\s\S]*ALTER COLUMN organization_id SET NOT NULL/,
    );
  });

  it("uses restrictive tenant foreign keys for durable event data", () => {
    expect(migration).toMatch(
      /FOREIGN KEY \(organization_id\) REFERENCES organizations\(id\) ON DELETE RESTRICT/g,
    );
  });

  it("keeps tenant authority unique per user and organization", () => {
    expect(migration).toContain("UNIQUE (organization_id, user_id)");
    expect(migration).toContain("PRIMARY KEY (user_id, role)");
  });

  it("does not grant the new tenant tables to PostgreSQL PUBLIC", () => {
    expect(migration).toMatch(/REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC;/);
  });
});
