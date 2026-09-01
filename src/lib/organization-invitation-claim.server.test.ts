import { describe, expect, it, vi } from "vitest";
import { claimOrganizationInvitationsForVerifiedGoogleUser } from "./organization-invitation-claim.server";

describe("claimOrganizationInvitationsForVerifiedGoogleUser", () => {
  it("does nothing without a server-verified Google subject", async () => {
    const client = { query: vi.fn() };
    await expect(
      claimOrganizationInvitationsForVerifiedGoogleUser(client, {
        id: "user-1",
        email: "admin@example.com",
        googleSubject: null,
      }),
    ).resolves.toEqual([]);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("claims only pending invitations matching the normalized verified email", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "invite-1",
              organization_id: "10000000-0000-4000-8000-000000000001",
            },
          ],
        })
        .mockResolvedValue({ rows: [] }),
    };

    await expect(
      claimOrganizationInvitationsForVerifiedGoogleUser(client, {
        id: "user-1",
        email: " ADMIN@Example.com ",
        googleSubject: "verified-google-subject",
      }),
    ).resolves.toEqual(["10000000-0000-4000-8000-000000000001"]);

    expect(client.query.mock.calls[0]?.[1]).toEqual(["admin@example.com"]);
    expect(client.query.mock.calls[1]?.[1]).toEqual(["invite-1", "user-1"]);
    expect(String(client.query.mock.calls[1]?.[0])).toContain(
      "WHEN organization_memberships.role = 'owner'",
    );
    expect(client.query.mock.calls[3]?.[1]).toEqual([
      "user-1",
      "admin@example.com",
      JSON.stringify({ invitationId: "invite-1" }),
      "10000000-0000-4000-8000-000000000001",
    ]);
  });
});
