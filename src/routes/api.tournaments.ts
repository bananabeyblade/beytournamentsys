import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { ApiError, listPublicTournaments } from "@/lib/railway-tournament-api.server";

export const Route = createFileRoute("/api/tournaments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const code = new URL(request.url).searchParams.get("code") ?? undefined;
          return Response.json({ tournaments: await listPublicTournaments(code) });
        } catch (error) {
          const status = error instanceof ApiError ? error.status : 500;
          const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
          return Response.json({ error: code }, { status });
        }
      },
    },
  },
});
