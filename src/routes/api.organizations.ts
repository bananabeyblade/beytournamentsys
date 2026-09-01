import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  createOrganizationForVerifiedGoogleUser,
  listOrganizationsForSession,
  OrganizationManagementError,
  updateSelectedOrganizationName,
} from "@/lib/organization-management.server";
import {
  SelectedOrganizationError,
  selectedOrganizationForSession,
} from "@/lib/selected-organization.server";
import { enforceRateLimit } from "@/lib/rate-limit.server";

function failure(error: unknown) {
  const expected =
    error instanceof OrganizationManagementError || error instanceof SelectedOrganizationError;
  const rateLimited =
    error instanceof Error &&
    (error as Error & { status?: number }).status === 429 &&
    error.message === "TOO_MANY_ATTEMPTS";
  const status = expected ? error.status : rateLimited ? 429 : 500;
  const code = expected || rateLimited ? (error as Error).message : "INTERNAL_ERROR";
  if (status === 500) console.error("[api/organizations]", error);
  return Response.json({ error: code }, { status, headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/organizations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const selected = await selectedOrganizationForSession(request);
          return Response.json(
            {
              organizations: await listOrganizationsForSession(request),
              selectedOrganizationId: selected.organization.id,
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return failure(error);
        }
      },
      POST: async ({ request }) => {
        try {
          await enforceRateLimit(request, "organization-create", 5, 60 * 60);
          const body: unknown = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new OrganizationManagementError(400, "INVALID_BODY");
          }
          const organization = await createOrganizationForVerifiedGoogleUser(
            request,
            body as Record<string, unknown>,
          );
          return Response.json(
            { organization },
            { status: 201, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return failure(error);
        }
      },
      PATCH: async ({ request }) => {
        try {
          await enforceRateLimit(request, "organization-name-update", 20, 60 * 60);
          const body: unknown = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new OrganizationManagementError(400, "INVALID_BODY");
          }
          const organization = await updateSelectedOrganizationName(
            request,
            body as Record<string, unknown>,
          );
          return Response.json({ organization }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
