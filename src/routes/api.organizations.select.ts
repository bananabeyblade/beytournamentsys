import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  SelectedOrganizationError,
  selectOrganizationForSession,
} from "@/lib/selected-organization.server";

export const Route = createFileRoute("/api/organizations/select")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body: unknown = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            throw new SelectedOrganizationError(400, "INVALID_BODY");
          }
          const result = await selectOrganizationForSession(
            request,
            (body as Record<string, unknown>).organizationId,
          );
          return Response.json(
            { organization: result.organization },
            { headers: { "set-cookie": result.cookie, "cache-control": "no-store" } },
          );
        } catch (error) {
          const status = error instanceof SelectedOrganizationError ? error.status : 500;
          const code =
            error instanceof SelectedOrganizationError ? error.message : "INTERNAL_ERROR";
          if (status === 500) console.error("[api/organizations/select]", error);
          return Response.json(
            { error: code },
            { status, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
