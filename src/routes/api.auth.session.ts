import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { logoutRailwaySession, readRailwaySession } from "@/lib/railway-auth.server";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await readRailwaySession(request);
        return Response.json(
          { authenticated: Boolean(user), user },
          { headers: { "cache-control": "no-store" } },
        );
      },
      DELETE: async ({ request }) => logoutRailwaySession(request),
    },
  },
});
