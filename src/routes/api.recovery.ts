import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { ApiError, claimPublicRecoveryCode } from "@/lib/railway-tournament-api.server";

export const Route = createFileRoute("/api/recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const data: unknown = await request.json().catch(() => null);
          if (!data || typeof data !== "object" || Array.isArray(data))
            throw new ApiError(400, "INVALID_BODY");
          const body = data as Record<string, unknown>;
          return Response.json(
            await claimPublicRecoveryCode(body.tournamentId, body.name, body.recoveryCode),
          );
        } catch (error) {
          const status = error instanceof ApiError ? error.status : 500;
          const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
          return Response.json({ error: code }, { status });
        }
      },
    },
  },
});
