import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

export const Route = createFileRoute("/health/database")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { postgresReadinessCheck } = await import("@/integrations/postgres/client.server");
          await postgresReadinessCheck();
          return Response.json({ ok: true, database: "postgres", schema: "ready" });
        } catch (error) {
          console.error("[health/database] PostgreSQL check failed", error);
          return Response.json({ ok: false, database: "postgres" }, { status: 503 });
        }
      },
    },
  },
});
