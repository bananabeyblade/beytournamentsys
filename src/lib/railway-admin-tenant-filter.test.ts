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

  it("scopes tournament archival to the selected organization", async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const request = new Request("https://example.test/api/admin/delete-tournament");
    const tournamentId = "20000000-0000-4000-8000-000000000002";

    await expect(
      railwayAdminPost(request, "delete-tournament", { id: tournamentId }),
    ).rejects.toMatchObject({ status: 404, code: "TOURNAMENT_NOT_FOUND" });

    expect(mocks.requireSelectedOrganizationRole).toHaveBeenCalledWith(request, ["owner"]);
    expect(mocks.queryPostgres).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE id=\$1 AND organization_id=\$2/),
      [tournamentId, ORGANIZATION_ID],
    );
  });

  it("scopes batch registration deletion to the selected organization", async () => {
    const request = new Request("https://example.test/api/admin/delete-registrations");
    const registrationId = "30000000-0000-4000-8000-000000000003";

    await expect(
      railwayAdminPost(request, "delete-registrations", { ids: [registrationId] }),
    ).resolves.toEqual({ ok: true, count: 1 });

    expect(mocks.requireSelectedOrganizationRole).toHaveBeenCalledWith(request, ["owner", "admin"]);
    expect(mocks.queryPostgres).toHaveBeenCalledWith(
      expect.stringMatching(/tournament\.organization_id=\$2/),
      [[registrationId], ORGANIZATION_ID],
    );
  });

  it("rejects external tournament logos that could track public visitors", async () => {
    await expect(
      railwayAdminPost(
        new Request("https://example.test/api/admin/create-tournament"),
        "create-tournament",
        { name: "Event", logoUrl: "https://tracker.example/pixel.png" },
      ),
    ).rejects.toMatchObject({ status: 400, code: "LOGO_URL_INVALID" });
    expect(mocks.queryPostgres).not.toHaveBeenCalled();
  });

  it("rejects a local logo asset uploaded by another account", async () => {
    const assetId = "40000000-0000-4000-8000-000000000004";
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      railwayAdminPost(
        new Request("https://example.test/api/admin/create-tournament"),
        "create-tournament",
        { name: "Event", logoUrl: `/api/assets/${assetId}` },
      ),
    ).rejects.toMatchObject({ status: 400, code: "LOGO_ASSET_NOT_FOUND" });

    expect(mocks.queryPostgres).toHaveBeenCalledWith(
      "SELECT 1 FROM tournament_assets WHERE id=$1 AND owner_user_id=$2 LIMIT 1",
      [assetId, "user-1"],
    );
  });

  it("does not expose the retired password reveal endpoint", async () => {
    await expect(
      railwayAdminGet(
        new Request(
          "https://example.test/api/admin/admin-password?userId=30000000-0000-4000-8000-000000000003",
        ),
        "admin-password",
      ),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(mocks.queryPostgres).not.toHaveBeenCalled();
  });

  it("creates an admin with a one-way hash and no recoverable password", async () => {
    mocks.queryPostgres.mockResolvedValueOnce({ rows: [{ value: "bcrypt-hash" }] });
    mocks.transactionQuery
      .mockResolvedValueOnce({ rows: [{ id: "30000000-0000-4000-8000-000000000003" }] })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(
      railwayAdminPost(new Request("https://example.test/api/admin/create-admin"), "create-admin", {
        account: "new-admin",
        password: "safe-password",
        role: "admin",
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.queryPostgres).toHaveBeenCalledWith(
      "SELECT crypt($1, gen_salt('bf', 12)) AS value",
      ["safe-password"],
    );
    expect(mocks.transactionQuery.mock.calls[0]?.[0]).toContain("password_hash");
    expect(mocks.transactionQuery.mock.calls[0]?.[0]).not.toContain("password_ciphertext");
    expect(mocks.transactionQuery.mock.calls[0]?.[1]).toEqual([
      "new-admin@beyx.local",
      null,
      "bcrypt-hash",
    ]);
  });

  it("resets a password without storing a recoverable copy", async () => {
    const userId = "30000000-0000-4000-8000-000000000003";
    mocks.queryPostgres
      .mockResolvedValueOnce({
        rows: [{ email: "admin@example.com", is_superadmin: false }],
        rowCount: 1,
      })
      .mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(
      railwayAdminPost(
        new Request("https://example.test/api/admin/set-admin-password"),
        "set-admin-password",
        { userId, password: "replacement-password" },
      ),
    ).resolves.toEqual({ ok: true });

    expect(mocks.queryPostgres.mock.calls[1]?.[0]).toContain("password_hash=crypt");
    expect(mocks.queryPostgres.mock.calls[1]?.[0]).not.toContain("password_ciphertext");
    expect(mocks.queryPostgres.mock.calls[1]?.[1]).toEqual([userId, "replacement-password"]);
  });
});
