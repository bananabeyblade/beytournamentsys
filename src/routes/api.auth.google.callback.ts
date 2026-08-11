import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { finishGoogleOAuth } from "@/lib/railway-auth.server";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: { handlers: { GET: async ({ request }) => finishGoogleOAuth(request) } },
});
