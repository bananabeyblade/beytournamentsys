import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  transactionQuery: vi.fn(),
  withPostgresTransaction: vi.fn(),
  requireRailwayPermanentUser: vi.fn(),
  requireSelectedOrganizationRole: vi.fn(),
  requireSelectedTournament: vi.fn(),
}));

vi.mock("@/integrations/postgres/client.server", () => ({
  queryPostgres: mocks.queryPostgres,
  withPostgresTransaction: mocks.withPostgresTransaction,
}));
vi.mock("./railway-auth.server", () => ({
  requireRailwayPermanentUser: mocks.requireRailwayPermanentUser,
  requireRailwayOperator: vi.fn(),
  requireRailwayOwner: vi.fn(),
}));
vi.mock("./selected-organization.server", () => ({
  requireSelectedOrganizationRole: mocks.requireSelectedOrganizationRole,
  requireSelectedTournament: mocks.requireSelectedTournament,
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

import { railwayAdminGet, railwayAdminPost } from "./railway-admin-api.server";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";

describe("admin tournament tenant filter", () => {
  beforeEach(() => {
    mocks.queryPostgres.mockReset();
    mocks.queryPostgres.mockResolvedValue({ rows: [] });
    mocks.transactionQuery.mockReset();
    mocks.withPostgresTransaction.mockReset();
    mocks.withPostgresTransaction.mockImplementation((work) =>
      work({ query: mocks.transactionQuery }),
    );
    mocks.requireSelectedTournament.mockReset();
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

  it("allows an organization admin to reset a tournament within the selected organization", async () => {
    mocks.requireSelectedOrganizationRole.mockResolvedValue({
      user: { id: "user-1" },
      organization: {
        id: ORGANIZATION_ID,
        slug: "alpha",
        name: "Alpha",
        role: "admin",
      },
    });
    mocks.queryPostgres
      .mockResolvedValueOnce({ rows: [{ name: "Event" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const request = new Request("https://example.test/api/admin/reset");

    await expect(
      railwayAdminPost(request, "reset", {
        id: "20000000-0000-4000-8000-000000000002",
        tableCount: 4,
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.requireSelectedOrganizationRole).toHaveBeenCalledWith(request, ["owner", "admin"]);
    expect(mocks.queryPostgres.mock.calls[0]?.[1]).toEqual([
      "20000000-0000-4000-8000-000000000002",
      4,
      null,
      ORGANIZATION_ID,
    ]);
  });

  it("does not treat a registration id as a tournament id when approving a sign-up", async () => {
    mocks.requireSelectedOrganizationRole.mockResolvedValue({
      user: { id: "user-1" },
      organization: {
        id: ORGANIZATION_ID,
        slug: "alpha",
        name: "Alpha",
        role: "admin",
      },
    });
    mocks.transactionQuery
      .mockResolvedValueOnce({
        rows: [
          {
            tournament_id: "20000000-0000-4000-8000-000000000002",
            name: "Player",
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const request = new Request("https://example.test/api/admin/delete-registration");
    const registrationId = "30000000-0000-4000-8000-000000000003";

    await expect(
      railwayAdminPost(request, "delete-registration", {
        id: registrationId,
        keepRecoveryCode: true,
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.requireSelectedTournament).not.toHaveBeenCalled();
    expect(mocks.transactionQuery.mock.calls[0]?.[1]).toEqual([registrationId, ORGANIZATION_ID]);
  });
});
