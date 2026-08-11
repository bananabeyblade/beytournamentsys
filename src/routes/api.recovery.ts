import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { ApiError, claimPublicRecoveryCode } from "@/lib/railway-tournament-api.server";
import { enforceRateLimit } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data: unknown = await request.json().catch(() => null);
          if (!data || typeof data !== "object" || Array.isArray(data))
            throw new ApiError(400, "INVALID_BODY");
          const body = data as Record<string, unknown>;
          await enforceRateLimit(
            request,
            "participant-recovery",
            10,
            15 * 60,
            `${String(body.tournamentId)}:${String(body.name)}`,
          );
          return Response.json(
            await claimPublicRecoveryCode(body.tournamentId, body.name, body.recoveryCode),
          );
        } catch (error) {
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
      },
    },
  },
});
