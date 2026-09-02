import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { queryPostgres } from "@/integrations/postgres/client.server";
import { enforceRateLimit } from "@/lib/rate-limit.server";
import { requireSelectedOrganizationRole } from "@/lib/selected-organization.server";
import { isValidTournamentLogo } from "@/lib/tournament-logo";

export const Route = createFileRoute("/api/admin/logo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { user } = await requireSelectedOrganizationRole(request, ["owner", "admin"]);
          await enforceRateLimit(request, "tournament-logo-upload", 20, 60 * 60, user.id);
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024)
            return Response.json({ error: "LOGO_INVALID" }, { status: 400 });
          const content = Buffer.from(await file.arrayBuffer());
          if (!isValidTournamentLogo(file.type, content))
            return Response.json({ error: "LOGO_INVALID" }, { status: 400 });
          const result = await queryPostgres<{ id: string }>(
            "INSERT INTO tournament_assets(owner_user_id,content_type,content) VALUES($1,$2,$3) RETURNING id",
            [user.id, file.type, content],
          );
          return Response.json({ url: `/api/assets/${result.rows[0].id}` }, { status: 201 });
        } catch (error) {
          const status = Number((error as { status?: number })?.status) || 500;
          if (status === 500) console.error("[api/admin/logo]", error);
          return Response.json(
            { error: error instanceof Error && status < 500 ? error.message : "INTERNAL_ERROR" },
            { status, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
