import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
}));

vi.mock("@/integrations/postgres/client.server", () => ({
  queryPostgres: mocks.queryPostgres,
  withPostgresTransaction: vi.fn(),
}));
vi.mock("./rate-limit.server", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("./tenant-onboarding.server", () => ({
  ensureLegacyOwnerForVerifiedGoogleUser: vi.fn(),
}));

import {
  readRailwaySession,
  requireRailwayOwner,
  requireRailwayPermanentUser,
} from "./railway-auth.server";

const organizationOwnerRow = {
  id: "user-1",
  email: "organization-owner@example.com",
  display_name: "Organization Owner",
  google_subject: "google-subject",
  role: null,
};

describe("Railway organization-owned sessions", () => {
  beforeEach(() => {
    mocks.queryPostgres.mockReset();
    mocks.queryPostgres.mockResolvedValue({ rows: [organizationOwnerRow] });
  });

  it("keeps a permanent Google session even without a legacy global admin role", async () => {
    const request = new Request("https://example.test/api/auth/session", {
      headers: { cookie: "beyx_session=permanent-token" },
    });

    await expect(readRailwaySession(request)).resolves.toMatchObject({
      id: "user-1",
      role: null,
      isGoogle: true,
      isDeveloper: false,
    });
  });

  it("gives a permanent session precedence over a stale referee cookie", async () => {
    const request = new Request("https://example.test/api/auth/session", {
      headers: {
        cookie: "beyx_session=permanent-token; beyx_referee_session=stale-referee-token",
      },
    });

    await expect(readRailwaySession(request)).resolves.toMatchObject({ id: "user-1", role: null });
    expect(mocks.queryPostgres).toHaveBeenCalledTimes(1);
  });

  it("does not mistake an organization owner for the fixed platform owner", async () => {
    const request = new Request("https://example.test/api/admin/action", {
      headers: { cookie: "beyx_session=permanent-token" },
    });

    await expect(requireRailwayPermanentUser(request)).resolves.toMatchObject({ id: "user-1" });
    await expect(requireRailwayOwner(request)).rejects.toMatchObject({
      status: 403,
      message: "OWNER_REQUIRED",
    });
  });
});
