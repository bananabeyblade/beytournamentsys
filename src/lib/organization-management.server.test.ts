import { describe, expect, it, vi } from "vitest";
import type { RailwaySessionUser } from "./railway-auth.server";
import {
  createOrganizationForPlatformOwner,
  listOrganizationsForSession,
  OrganizationManagementError,
  type OrganizationManagementDependencies,
} from "./organization-management.server";

const request = new Request("https://staging.example/api/organizations");

function session(overrides: Partial<RailwaySessionUser> = {}): RailwaySessionUser {
  return {
    id: "user-1",
    email: "john410403123@gmail.com",
    displayName: "Owner",
    role: "superadmin",
    isGoogle: true,
    isDeveloper: true,
    ...overrides,
  };
}

function dependencies(user: RailwaySessionUser | null): OrganizationManagementDependencies {
  return {
    readSession: vi.fn().mockResolvedValue(user),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    transaction: vi.fn(),
  };
}

async function expectCode(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({
    status,
    message: code,
  });
}

describe("organization management", () => {
  it("requires authentication before listing memberships", async () => {
    const deps = dependencies(null);
    await expectCode(listOrganizationsForSession(request, deps), 401, "AUTH_REQUIRED");
    expect(deps.query).not.toHaveBeenCalled();
  });

  it("derives the organization list solely from the authenticated user", async () => {
    const deps = dependencies(session());
    vi.mocked(deps.query).mockResolvedValue({
      rows: [{ id: "org-1", slug: "alpha", name: "Alpha", status: "active", role: "owner" }],
    });
    await expect(listOrganizationsForSession(request, deps)).resolves.toHaveLength(1);
    expect(deps.query).toHaveBeenCalledWith(expect.stringContaining("membership.user_id = $1"), [
      "user-1",
    ]);
  });

  it("rejects tenant admins and unverified identities from creating tenants", async () => {
    const deps = dependencies(
      session({ role: "admin", isDeveloper: false, email: "admin@example.com" }),
    );
    await expectCode(
      createOrganizationForPlatformOwner(request, { name: "Alpha", slug: "alpha" }, deps),
      403,
      "PLATFORM_OWNER_REQUIRED",
    );
    expect(deps.transaction).not.toHaveBeenCalled();
  });

  it("rechecks the platform developer role inside the creation transaction", async () => {
    const deps = dependencies(session());
    vi.mocked(deps.transaction).mockImplementation(async (work) =>
      work({ query: vi.fn().mockResolvedValue({ rows: [{ authorized: false }] }) }),
    );
    await expectCode(
      createOrganizationForPlatformOwner(request, { name: "Alpha", slug: "alpha" }, deps),
      403,
      "PLATFORM_OWNER_REQUIRED",
    );
  });

  it("creates the tenant and owner boundary atomically without accepting a client owner id", async () => {
    const deps = dependencies(session());
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ authorized: true }] })
      .mockResolvedValueOnce({
        rows: [{ id: "org-new", slug: "alpha", name: "Alpha", status: "active" }],
      })
      .mockResolvedValue({ rows: [] });
    vi.mocked(deps.transaction).mockImplementation(async (work) => work({ query }));

    await expect(
      createOrganizationForPlatformOwner(
        request,
        { name: " Alpha ", slug: "ALPHA", ownerId: "attacker-user" },
        deps,
      ),
    ).resolves.toEqual({
      id: "org-new",
      slug: "alpha",
      name: "Alpha",
      status: "active",
      role: "owner",
    });

    const calls = query.mock.calls;
    expect(calls[2]?.[1]).toEqual(["org-new", "user-1"]);
    expect(JSON.stringify(calls)).not.toContain("attacker-user");
  });

  it("returns a conflict for an existing tenant slug", async () => {
    const deps = dependencies(session());
    vi.mocked(deps.transaction).mockRejectedValue({ code: "23505" });
    await expectCode(
      createOrganizationForPlatformOwner(request, { name: "Alpha", slug: "alpha" }, deps),
      409,
      "ORGANIZATION_SLUG_EXISTS",
    );
  });
});
