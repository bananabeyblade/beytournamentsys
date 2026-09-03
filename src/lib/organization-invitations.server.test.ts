import { describe, expect, it, vi } from "vitest";
import type { RailwaySessionUser } from "./railway-auth.server";
import {
  inviteGoogleOrganizationAdmin,
  listSelectedOrganizationInvitations,
  type OrganizationInvitationDependencies,
  revokeSelectedOrganizationInvitation,
} from "./organization-invitations.server";

const request = new Request("https://example.test/api/organization-invitations");
const organization = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "alpha",
  name: "Alpha",
  role: "owner" as const,
};
const user: RailwaySessionUser = {
  id: "user-owner",
  email: "owner@example.com",
  displayName: "Owner",
  role: null,
  isGoogle: true,
  isDeveloper: false,
};

function dependencies(): OrganizationInvitationDependencies {
  return {
    requireOwner: vi.fn().mockResolvedValue({ user, organization }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn(),
  };
}

describe("organization Google invitations", () => {
  it("lists invitations only for the server-selected organization", async () => {
    const deps = dependencies();
    await listSelectedOrganizationInvitations(request, deps);
    expect(deps.requireOwner).toHaveBeenCalledWith(request);
    expect(deps.query).toHaveBeenCalledWith(expect.stringContaining("organization_id = $1"), [
      organization.id,
    ]);
  });

  it("creates a normalized invitation without trusting a client organization id", async () => {
    const deps = dependencies();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ exists: false }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "invite-1",
            email: "admin@example.com",
            role: "admin",
            status: "pending",
            createdAt: "2026-09-01T00:00:00Z",
            expiresAt: "2026-09-08T00:00:00Z",
            acceptedAt: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(deps.transaction).mockImplementation(async (work) => work({ query }));

    await expect(
      inviteGoogleOrganizationAdmin(
        request,
        { email: " ADMIN@Example.com ", organizationId: "attacker-organization" },
        deps,
      ),
    ).resolves.toMatchObject({ id: "invite-1", email: "admin@example.com" });

    expect(query.mock.calls[0]?.[1]).toEqual([organization.id, "admin@example.com"]);
    expect(query.mock.calls[1]?.[1]).toEqual([organization.id, "admin@example.com", "user-owner"]);
    expect(JSON.stringify(query.mock.calls)).not.toContain("attacker-organization");
  });

  it("rejects self-invitations and existing members", async () => {
    const selfDeps = dependencies();
    await expect(
      inviteGoogleOrganizationAdmin(request, { email: "OWNER@example.com" }, selfDeps),
    ).rejects.toMatchObject({ status: 409, message: "INVITATION_SELF" });
    expect(selfDeps.transaction).not.toHaveBeenCalled();

    const memberDeps = dependencies();
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ exists: true }] });
    vi.mocked(memberDeps.transaction).mockImplementation(async (work) => work({ query }));
    await expect(
      inviteGoogleOrganizationAdmin(request, { email: "member@example.com" }, memberDeps),
    ).rejects.toMatchObject({ status: 409, message: "INVITATION_MEMBER_EXISTS" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("revokes an invitation only inside the selected organization", async () => {
    const deps = dependencies();
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "20000000-0000-4000-8000-000000000002", email: "admin@example.com" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(deps.transaction).mockImplementation(async (work) => work({ query }));

    await expect(
      revokeSelectedOrganizationInvitation(
        request,
        {
          invitationId: "20000000-0000-4000-8000-000000000002",
          organizationId: "attacker-organization",
        },
        deps,
      ),
    ).resolves.toEqual({ ok: true });
    expect(query.mock.calls[0]?.[1]).toEqual([
      "20000000-0000-4000-8000-000000000002",
      organization.id,
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain("attacker-organization");
  });
});
