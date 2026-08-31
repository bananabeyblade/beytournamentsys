import { beforeEach, describe, expect, it, vi } from "vitest";

const postgres = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  withPostgresTransaction: vi.fn(),
}));

vi.mock("@/integrations/postgres/client.server", () => postgres);

import { deckRegistrationEnabled } from "./railway-tournament-api.server";

const TOURNAMENT_ID = "10000000-0000-4000-8000-000000000001";

describe("tournament-scoped Deck and Combo feature flag", () => {
  beforeEach(() => {
    postgres.queryPostgres.mockReset();
  });

  it("resolves the flag through the tournament organization", async () => {
    postgres.queryPostgres.mockResolvedValue({ rows: [{ enabled: false }] });

    await expect(deckRegistrationEnabled(TOURNAMENT_ID)).resolves.toBe(false);
    expect(postgres.queryPostgres).toHaveBeenCalledWith(
      expect.stringContaining("flag.organization_id=tournament.organization_id"),
      [TOURNAMENT_ID],
    );
  });

  it("fails closed when the tournament does not exist", async () => {
    postgres.queryPostgres.mockResolvedValue({ rows: [] });
    await expect(deckRegistrationEnabled(TOURNAMENT_ID)).resolves.toBe(false);
  });

  it("requires a valid tournament id instead of falling back to a global flag", async () => {
    await expect(deckRegistrationEnabled(null)).rejects.toMatchObject({
      status: 400,
      code: "TOURNAMENT_ID_INVALID",
    });
    expect(postgres.queryPostgres).not.toHaveBeenCalled();
  });
});
