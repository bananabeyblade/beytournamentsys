import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  requireRailwayAdmin: vi.fn(),
  requireSelectedOrganizationRole: vi.fn(),
}));

vi.mock("@/integrations/postgres/client.server", () => ({
  queryPostgres: mocks.queryPostgres,
  withPostgresTransaction: vi.fn(),
}));
vi.mock("./railway-auth.server", () => ({
  requireRailwayAdmin: mocks.requireRailwayAdmin,
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
    mocks.requireRailwayAdmin.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      displayName: "Owner",
      role: "superadmin",
      isGoogle: true,
      isDeveloper: true,
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
});
