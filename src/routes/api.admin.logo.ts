import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { queryPostgres } from "@/integrations/postgres/client.server";
import { requireRailwayAdmin } from "@/lib/railway-auth.server";

export const Route = createFileRoute("/api/admin/logo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireRailwayAdmin(request);
          const form = await request.formData();
          const file = form.get("file");
          if (
            !(file instanceof File) ||
            !file.type.startsWith("image/") ||
            file.size > 5 * 1024 * 1024
          )
            return Response.json({ error: "LOGO_INVALID" }, { status: 400 });
          const result = await queryPostgres<{ id: string }>(
            "INSERT INTO tournament_assets(owner_user_id,content_type,content) VALUES($1,$2,$3) RETURNING id",
            [user.id, file.type, Buffer.from(await file.arrayBuffer())],
          );
          return Response.json({ url: `/api/assets/${result.rows[0].id}` }, { status: 201 });
        } catch (error) {
          const status = Number((error as { status?: number })?.status) || 500;
          return Response.json(
            { error: error instanceof Error ? error.message : "INTERNAL_ERROR" },
            { status },
          );
        }
      },
    },
  },
});
