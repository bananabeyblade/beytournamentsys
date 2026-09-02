import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("one-way administrator password storage", () => {
  it("permanently removes the legacy recoverable password column", () => {
    const migration = read("../../database/migrations/0029_remove_recoverable_admin_passwords.sql");
    expect(migration).toMatch(/DROP COLUMN IF EXISTS password_ciphertext/i);
  });

  it("does not ship encryption or password reveal code in the Railway API", () => {
    const api = read("./railway-admin-api.server.ts");
    const client = read("./admin-client.ts");
    expect(api).not.toContain("password_ciphertext");
    expect(api).not.toContain("decryptAdminPassword");
    expect(api).not.toContain('action === "admin-password"');
    expect(client).not.toContain("revealAdminPasswordFn");
  });
});
