import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  requireRailwayPermanentUser: vi.fn(),
  requireSelectedOrganizationRole: vi.fn(),
}));

vi.mock("@/integrations/postgres/client.server", () => ({
  queryPostgres: mocks.queryPostgres,
  withPostgresTransaction: vi.fn(),
}));
vi.mock("./railway-auth.server", () => ({
  requireRailwayPermanentUser: mocks.requireRailwayPermanentUser,
  requireRailwayOperator: vi.fn(),
  requireRailwayOwner: vi.fn(),
}));
vi.mock("./selected-organization.server", () => ({
  requireSelectedOrganizationRole: mocks.requireSelectedOrganizationRole,
  requireSelectedTournament: vi.fn(),
}));
vi.mock("./admin-password-vault.server", () => ({
  decryptAdminPassword: vi.fn(),
  encryptAdminPassword: vi.fn(),
}));
vi.mock("./referee-access.server", () => ({
  createOrUpdateRefereeInvite: vi.fn(),
  decideReferee: vi.fn(),
  getRefereeAccess: vi.fn(),
}));

import { railwayAdminGet } from "./railway-admin-api.server";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";

describe("admin tournament tenant filter", () => {
  beforeEach(() => {
    mocks.queryPostgres.mockReset();
    mocks.queryPostgres.mockResolvedValue({ rows: [] });
    mocks.requireRailwayPermanentUser.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      displayName: "Owner",
      role: null,
      isGoogle: true,
      isDeveloper: false,
    });
    mocks.requireSelectedOrganizationRole.mockResolvedValue({
      user: { id: "user-1" },
      organization: {
        id: ORGANIZATION_ID,
        slug: "alpha",
        name: "Alpha",
        role: "owner",
      },
    });
  });

  it("looks up a restored tournament by code only inside the active tenant", async () => {
    await expect(
      railwayAdminGet(
        new Request("https://example.test/api/admin/tournaments?code=WJUAFU"),
        "tournaments",
      ),
    ).resolves.toEqual({ tournaments: [] });

    expect(mocks.queryPostgres).toHaveBeenCalledWith(
      expect.stringMatching(/organization_id=\$1[\s\S]*code=\$3/),
      [ORGANIZATION_ID, expect.any(Array), "WJUAFU"],
    );
  });

  it("rejects malformed persisted tournament codes", async () => {
    await expect(
      railwayAdminGet(
        new Request("https://example.test/api/admin/tournaments?code=../../other"),
        "tournaments",
      ),
    ).rejects.toMatchObject({ status: 400, code: "CODE_INVALID" });
    expect(mocks.queryPostgres).not.toHaveBeenCalled();
  });

  it("does not trust a permanent Google session without an active selected membership", async () => {
    mocks.requireSelectedOrganizationRole.mockRejectedValue(
      Object.assign(new Error("SELECTED_ORGANIZATION_FORBIDDEN"), { status: 403 }),
    );

    await expect(
      railwayAdminGet(new Request("https://example.test/api/admin/tournaments"), "tournaments"),
    ).rejects.toMatchObject({ status: 403, message: "SELECTED_ORGANIZATION_FORBIDDEN" });
    expect(mocks.queryPostgres).not.toHaveBeenCalled();
  });
});
