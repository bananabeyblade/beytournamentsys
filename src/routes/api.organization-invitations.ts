import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  inviteGoogleOrganizationAdmin,
  listSelectedOrganizationInvitations,
  OrganizationInvitationError,
  revokeSelectedOrganizationInvitation,
} from "@/lib/organization-invitations.server";
import { SelectedOrganizationError } from "@/lib/selected-organization.server";
import { enforceRateLimit } from "@/lib/rate-limit.server";

function failure(error: unknown) {
  const expected =
    error instanceof OrganizationInvitationError || error instanceof SelectedOrganizationError;
  const rateLimited =
    error instanceof Error &&
    (error as Error & { status?: number }).status === 429 &&
    error.message === "TOO_MANY_ATTEMPTS";
  const status = expected ? error.status : rateLimited ? 429 : 500;
  const code = expected || rateLimited ? (error as Error).message : "INTERNAL_ERROR";
  if (status === 500) console.error("[api/organization-invitations]", error);
  return Response.json({ error: code }, { status, headers: { "cache-control": "no-store" } });
}

async function body(request: Request) {
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrganizationInvitationError(400, "INVALID_BODY");
  }
  return value as Record<string, unknown>;
}

export const Route = createFileRoute("/api/organization-invitations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return Response.json(
            { invitations: await listSelectedOrganizationInvitations(request) },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return failure(error);
        }
      },
      POST: async ({ request }) => {
        try {
          await enforceRateLimit(request, "organization-invitation-create", 20, 60 * 60);
          const invitation = await inviteGoogleOrganizationAdmin(request, await body(request));
          return Response.json(
            { invitation },
            { status: 201, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return failure(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          await enforceRateLimit(request, "organization-invitation-revoke", 50, 60 * 60);
          return Response.json(
            await revokeSelectedOrganizationInvitation(request, await body(request)),
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
