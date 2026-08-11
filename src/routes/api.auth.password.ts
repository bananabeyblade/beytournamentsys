import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { loginRailwayWithPassword } from "@/lib/railway-auth.server";

export const Route = createFileRoute("/api/auth/password")({
  server: {
    handlers: {
      POST: async ({ request }) => loginRailwayWithPassword(request),
    },
  },
});
