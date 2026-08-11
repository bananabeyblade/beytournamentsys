import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { ApiError, listPublicTournaments } from "@/lib/railway-tournament-api.server";

export const Route = createFileRoute("/api/tournaments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const code = new URL(request.url).searchParams.get("code") ?? undefined;
          const payload = JSON.stringify({ tournaments: await listPublicTournaments(code) });
          const etag = `"${createHash("sha256").update(payload).digest("base64url").slice(0, 22)}"`;
          const headers = {
            "cache-control": "no-cache, private",
            "content-type": "application/json; charset=utf-8",
            etag,
            vary: "accept-encoding",
          };
          if (request.headers.get("if-none-match") === etag)
            return new Response(null, { status: 304, headers });
          return new Response(payload, { status: 200, headers });
        } catch (error) {
          const status = error instanceof ApiError ? error.status : 500;
          const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
          return Response.json({ error: code }, { status });
        }
      },
    },
  },
});
