import { describe, expect, it, vi } from "vitest";
import type { RailwaySessionUser } from "./railway-auth.server";
import {
  createOrganizationForVerifiedGoogleUser,
  listOrganizationsForSession,
  OrganizationManagementError,
  type OrganizationManagementDependencies,
  updateSelectedOrganizationName,
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
    requireSelectedOwner: vi.fn().mockResolvedValue({
      user: user ?? session(),
      organization: {
        id: "org-selected",
        slug: "alpha",
        name: "Old name",
        role: "owner",
      },
    }),
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

  it("rejects identities that were not verified by Google", async () => {
    const deps = dependencies(session({ isGoogle: false, isDeveloper: false }));
    await expectCode(
      createOrganizationForVerifiedGoogleUser(request, { name: "Alpha", slug: "alpha" }, deps),
      403,
      "GOOGLE_ACCOUNT_REQUIRED",
    );
    expect(deps.transaction).not.toHaveBeenCalled();
  });

  it("limits a regular Google account to one owned organization", async () => {
    const deps = dependencies(session({ role: null, isDeveloper: false }));
    vi.mocked(deps.transaction).mockImplementation(async (work) =>
      work({ query: vi.fn().mockResolvedValue({ rows: [{ count: "1" }] }) }),
    );
    await expectCode(
      createOrganizationForVerifiedGoogleUser(request, { name: "Alpha", slug: "alpha" }, deps),
      409,
      "ORGANIZATION_LIMIT_REACHED",
    );
  });

  it("creates a first organization and grants its verified Google user owner authority", async () => {
    const deps = dependencies(session({ role: null, isDeveloper: false }));
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "org-new", slug: "alpha", name: "Alpha", status: "active" }],
      })
      .mockResolvedValue({ rows: [] });
    vi.mocked(deps.transaction).mockImplementation(async (work) => work({ query }));

    await expect(
      createOrganizationForVerifiedGoogleUser(
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
    expect(calls.map(([sql]) => String(sql)).join("\n")).not.toContain("INSERT INTO admin_roles");
    expect(JSON.stringify(calls)).not.toContain("attacker-user");
  });

  it("allows the platform owner to create additional organizations", async () => {
    const deps = dependencies(session());
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })
      .mockResolvedValueOnce({
        rows: [{ id: "org-new", slug: "alpha", name: "Alpha", status: "active" }],
      })
      .mockResolvedValue({ rows: [] });
    vi.mocked(deps.transaction).mockImplementation(async (work) => work({ query }));

    await expect(
      createOrganizationForVerifiedGoogleUser(request, { name: "Alpha", slug: "alpha" }, deps),
    ).resolves.toMatchObject({ id: "org-new", role: "owner" });
  });

  it("returns a conflict for an existing tenant slug", async () => {
    const deps = dependencies(session());
    vi.mocked(deps.transaction).mockRejectedValue({ code: "23505" });
    await expectCode(
      createOrganizationForVerifiedGoogleUser(request, { name: "Alpha", slug: "alpha" }, deps),
      409,
      "ORGANIZATION_SLUG_EXISTS",
    );
  });

  it("updates only the server-selected organization and records an audit event", async () => {
    const deps = dependencies(session({ role: null, isDeveloper: false }));
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "org-selected", slug: "alpha", name: "New name", status: "active" }],
      })
      .mockResolvedValueOnce({ rows: [] });
    vi.mocked(deps.transaction).mockImplementation(async (work) => work({ query }));

    await expect(
      updateSelectedOrganizationName(
        request,
        {
          name: " New name ",
          organizationId: "org-attacker",
          slug: "attacker-slug",
          ownerId: "attacker-user",
        },
        deps,
      ),
    ).resolves.toEqual({
      id: "org-selected",
      slug: "alpha",
      name: "New name",
      status: "active",
      role: "owner",
    });

    expect(deps.requireSelectedOwner).toHaveBeenCalledWith(request);
    expect(query.mock.calls[0]?.[1]).toEqual(["New name", "org-selected"]);
    expect(query.mock.calls[1]?.[1]).toEqual([
      "user-1",
      "john410403123@gmail.com",
      JSON.stringify({ previousName: "Old name", name: "New name" }),
      "org-selected",
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain("org-attacker");
    expect(JSON.stringify(query.mock.calls)).not.toContain("attacker-slug");
    expect(JSON.stringify(query.mock.calls)).not.toContain("attacker-user");
  });

  it("rejects invalid organization names before resolving tenant authority", async () => {
    const deps = dependencies(session());
    await expectCode(
      updateSelectedOrganizationName(request, { name: "   " }, deps),
      400,
      "ORGANIZATION_NAME_INVALID",
    );
    expect(deps.requireSelectedOwner).not.toHaveBeenCalled();
    expect(deps.transaction).not.toHaveBeenCalled();
  });

  it("does not start an update transaction when the selected membership is not owner", async () => {
    const deps = dependencies(session({ role: "admin" }));
    vi.mocked(deps.requireSelectedOwner).mockRejectedValue(
      Object.assign(new Error("FORBIDDEN"), { status: 403 }),
    );

    await expect(
      updateSelectedOrganizationName(request, { name: "New name" }, deps),
    ).rejects.toMatchObject({
      status: 403,
      message: "FORBIDDEN",
    });
    expect(deps.transaction).not.toHaveBeenCalled();
  });
});
