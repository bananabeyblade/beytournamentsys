import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  ApiError,
  createPublicRegistration,
  registrationNameTaken,
} from "@/lib/railway-tournament-api.server";
import { enforceRateLimit } from "@/lib/rate-limit.server";

async function body(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "INVALID_BODY");
  return value as Record<string, unknown>;
}

function errorResponse(error: unknown) {
  const status =
    error instanceof ApiError
      ? error.status
      : Number((error as { status?: number })?.status) || 500;
  const code = error instanceof Error && status !== 500 ? error.message : "INTERNAL_ERROR";
  const retryAfter = Number((error as { retryAfter?: number })?.retryAfter);
  return Response.json(
    { error: code },
    { status, headers: retryAfter > 0 ? { "retry-after": String(retryAfter) } : undefined },
  );
}

export const Route = createFileRoute("/api/registrations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data = await body(request);
          await enforceRateLimit(
            request,
            "public-registration",
            256,
            15 * 60,
            String(data.tournamentId),
          );
          return Response.json(await createPublicRegistration(data.tournamentId, data.name), {
            status: 201,
          });
        } catch (error) {
          return errorResponse(error);
        }
      },
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          return Response.json(
            await registrationNameTaken(
              url.searchParams.get("tournamentId"),
              url.searchParams.get("name"),
            ),
          );
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
