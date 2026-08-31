import { describe, expect, it, vi } from "vitest";
import type { RailwaySessionUser } from "./railway-auth.server";
import {
  ORGANIZATION_COOKIE,
  requireSelectedTournament,
  selectedOrganizationCookie,
  selectedOrganizationForSession,
  selectOrganizationForSession,
  type SelectedOrganizationDependencies,
} from "./selected-organization.server";

const ORG_A = "10000000-0000-4000-8000-000000000001";
const ORG_B = "20000000-0000-4000-8000-000000000002";

function user(): RailwaySessionUser {
  return {
    id: "user-1",
    email: "owner@example.com",
    displayName: "Owner",
    role: "superadmin",
    isGoogle: true,
    isDeveloper: false,
  };
}

function dependencies(): SelectedOrganizationDependencies {
  return {
    readSession: vi.fn().mockResolvedValue(user()),
    query: vi.fn(),
  };
}

const organization = (id = ORG_A) => ({ id, slug: "alpha", name: "Alpha", role: "owner" as const });

describe("selected organization context", () => {
  it("chooses an active server-known membership when no cookie exists", async () => {
    const deps = dependencies();
    vi.mocked(deps.query).mockResolvedValue({ rows: [organization()] });
    const context = await selectedOrganizationForSession(
      new Request("https://example.test/api/admin/tournaments"),
      deps,
    );
    expect(context.organization.id).toBe(ORG_A);
    expect(deps.query).toHaveBeenCalledWith(expect.stringContaining("membership.user_id = $1"), [
      "user-1",
      null,
      expect.any(String),
    ]);
  });

  it("rejects a malformed cookie before querying memberships", async () => {
    const deps = dependencies();
    const request = new Request("https://example.test/api/admin/tournaments", {
      headers: { cookie: `${ORGANIZATION_COOKIE}=not-a-uuid` },
    });
    await expect(selectedOrganizationForSession(request, deps)).rejects.toMatchObject({
      status: 403,
      message: "SELECTED_ORGANIZATION_FORBIDDEN",
    });
    expect(deps.query).not.toHaveBeenCalled();
  });

  it("rejects malformed cookie encoding without throwing an internal error", async () => {
    const deps = dependencies();
    const request = new Request("https://example.test/api/admin/tournaments", {
      headers: { cookie: `${ORGANIZATION_COOKIE}=%` },
    });
    await expect(selectedOrganizationForSession(request, deps)).rejects.toMatchObject({
      status: 403,
      message: "SELECTED_ORGANIZATION_FORBIDDEN",
    });
    expect(deps.query).not.toHaveBeenCalled();
  });

  it("rejects a valid but unauthorized organization id instead of falling back", async () => {
    const deps = dependencies();
    vi.mocked(deps.query).mockResolvedValue({ rows: [] });
    const request = new Request("https://example.test/api/admin/tournaments", {
      headers: { cookie: `${ORGANIZATION_COOKIE}=${ORG_B}` },
    });
    await expect(selectedOrganizationForSession(request, deps)).rejects.toMatchObject({
      status: 403,
      message: "SELECTED_ORGANIZATION_FORBIDDEN",
    });
    expect(deps.query).toHaveBeenCalledWith(expect.any(String), [
      "user-1",
      ORG_B,
      expect.any(String),
    ]);
  });

  it("sets a hardened cookie only after verifying membership", async () => {
    const deps = dependencies();
    vi.mocked(deps.query).mockResolvedValue({ rows: [organization()] });
    const result = await selectOrganizationForSession(
      new Request("https://example.test/api/organizations/select"),
      ORG_A,
      deps,
    );
    expect(result.cookie).toContain(`${ORGANIZATION_COOKIE}=${ORG_A}`);
    expect(result.cookie).toContain("HttpOnly");
    expect(result.cookie).toContain("Secure");
    expect(result.cookie).toContain("SameSite=Lax");
    expect(selectedOrganizationCookie(ORG_A)).toBe(result.cookie);
  });

  it("hides a tournament that belongs to another selected tenant", async () => {
    const deps = dependencies();
    vi.mocked(deps.query)
      .mockResolvedValueOnce({ rows: [organization(ORG_A)] })
      .mockResolvedValueOnce({ rows: [] });
    const request = new Request("https://example.test/api/admin/finish", {
      headers: { cookie: `${ORGANIZATION_COOKIE}=${ORG_A}` },
    });
    await expect(
      requireSelectedTournament(request, ORG_B, ["owner", "admin"], deps),
    ).rejects.toMatchObject({
      status: 404,
      message: "TOURNAMENT_NOT_FOUND",
    });
    expect(deps.query).toHaveBeenLastCalledWith(expect.stringContaining("organization_id = $2"), [
      ORG_B,
      ORG_A,
    ]);
  });
});
