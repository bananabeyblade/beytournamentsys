import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { beginGoogleOAuth } from "@/lib/railway-auth.server";

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return beginGoogleOAuth(request);
        } catch (error) {
          console.error("[auth/google] initiation failed", error);
          return Response.json({ error: "OAUTH_NOT_CONFIGURED" }, { status: 503 });
        }
      },
    },
  },
});
