import { describe, expect, it, vi } from "vitest";
import {
  ensureLegacyOwnerForVerifiedGoogleUser,
  LEGACY_ORGANIZATION_ID,
} from "./tenant-onboarding.server";

function fakeClient() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe("ensureLegacyOwnerForVerifiedGoogleUser", () => {
  it("does not grant tenant authority from an unverified or different email", async () => {
    const client = fakeClient();
    await expect(
      ensureLegacyOwnerForVerifiedGoogleUser(client, {
        id: "user-1",
        email: "john410403123@gmail.com",
        googleSubject: null,
      }),
    ).resolves.toBe(false);
    await expect(
      ensureLegacyOwnerForVerifiedGoogleUser(client, {
        id: "user-2",
        email: "someone@example.com",
        googleSubject: "verified-google-subject",
      }),
    ).resolves.toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("idempotently establishes every owner boundary after verified Google login", async () => {
    const client = fakeClient();
    await expect(
      ensureLegacyOwnerForVerifiedGoogleUser(client, {
        id: "owner-user-id",
        email: "JOHN410403123@GMAIL.COM",
        googleSubject: "verified-google-subject",
      }),
    ).resolves.toBe(true);

    expect(client.query).toHaveBeenCalledTimes(4);
    const statements = client.query.mock.calls.map(([sql]) => String(sql)).join("\n");
    expect(statements).toContain("INSERT INTO admin_roles");
    expect(statements).toContain("UPDATE organizations");
    expect(statements).toContain("INSERT INTO organization_memberships");
    expect(statements).toContain("INSERT INTO platform_roles");
    expect(client.query.mock.calls[1]?.[1]).toEqual(["owner-user-id", LEGACY_ORGANIZATION_ID]);
  });
});
