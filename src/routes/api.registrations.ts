import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  ApiError,
  createPublicRegistration,
  listActiveParts,
  loadPublicParticipantDeck,
  registrationNameTaken,
  savePublicParticipantDeck,
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
          const action = data.action;
          if (action === "load-deck" || action === "save-deck") {
            await enforceRateLimit(
              request,
              `participant-${action}`,
              60,
              15 * 60,
              String(data.tournamentId),
            );
            return Response.json(
              action === "load-deck"
                ? await loadPublicParticipantDeck(data.tournamentId, data.name, data.recoveryCode)
                : await savePublicParticipantDeck(
                    data.tournamentId,
                    data.name,
                    data.recoveryCode,
                    data.combos,
                  ),
            );
          }
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
          if (url.searchParams.get("parts") === "1") {
            return Response.json(await listActiveParts());
          }
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
