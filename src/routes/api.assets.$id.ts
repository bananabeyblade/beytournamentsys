import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { queryPostgres } from "@/integrations/postgres/client.server";

export const Route = createFileRoute("/api/assets/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response(null, { status: 404 });
        const result = await queryPostgres<{ content_type: string; content: Buffer }>(
          "SELECT content_type,content FROM tournament_assets WHERE id=$1",
          [params.id],
        );
        const asset = result.rows[0];
        if (!asset) return new Response(null, { status: 404 });
        return new Response(new Uint8Array(asset.content), {
          headers: {
            "content-type": asset.content_type,
            "cache-control": "public,max-age=31536000,immutable",
          },
        });
      },
    },
  },
});
