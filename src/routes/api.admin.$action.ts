import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { AdminApiError, railwayAdminGet, railwayAdminPost } from "@/lib/railway-admin-api.server";

function failure(error: unknown) {
  const status =
    error instanceof AdminApiError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const code = error instanceof Error && status < 500 ? error.message : "INTERNAL_ERROR";
  if (status === 500) console.error("[api/admin]", error);
  return Response.json({ error: code }, { status });
}

export const Route = createFileRoute("/api/admin/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          return Response.json(await railwayAdminGet(request, params.action), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return failure(error);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const value: unknown = await request.json().catch(() => null);
          if (!value || typeof value !== "object" || Array.isArray(value))
            throw new AdminApiError(400, "INVALID_BODY");
          return Response.json(
            await railwayAdminPost(request, params.action, value as Record<string, unknown>),
          );
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
