import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/health/database")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { postgresHealthcheck } = await import("@/integrations/postgres/client.server");
          await postgresHealthcheck();
          return Response.json({ ok: true, database: "postgres" });
        } catch (error) {
          console.error("[health/database] PostgreSQL check failed", error);
          return Response.json({ ok: false, database: "postgres" }, { status: 503 });
        }
      },
    },
  },
});
