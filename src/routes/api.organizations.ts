import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  createOrganizationForPlatformOwner,
  listOrganizationsForSession,
  OrganizationManagementError,
} from "@/lib/organization-management.server";
import {
  SelectedOrganizationError,
  selectedOrganizationForSession,
} from "@/lib/selected-organization.server";

function failure(error: unknown) {
  const expected =
    error instanceof OrganizationManagementError || error instanceof SelectedOrganizationError;
  const status = expected ? error.status : 500;
  const code = expected ? error.message : "INTERNAL_ERROR";
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
          const body: unknown = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new OrganizationManagementError(400, "INVALID_BODY");
          }
          const organization = await createOrganizationForPlatformOwner(
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
    },
  },
});
