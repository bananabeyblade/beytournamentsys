import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  logoutRailwaySession,
  readRailwayRefereeClaim,
  readRailwaySession,
} from "@/lib/railway-auth.server";
import { selectedOrganizationForSession } from "@/lib/selected-organization.server";

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await readRailwaySession(request);
        const refereeClaim = await readRailwayRefereeClaim(request);
        const selected =
          user && user.role !== "referee"
            ? await selectedOrganizationForSession(request).catch(() => null)
            : null;
        return Response.json(
          {
            authenticated: Boolean(user),
            user: user
              ? { ...user, organizationRole: selected?.organization.role ?? undefined }
              : null,
            refereeClaim,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
      DELETE: async ({ request }) => logoutRailwaySession(request),
    },
  },
});
