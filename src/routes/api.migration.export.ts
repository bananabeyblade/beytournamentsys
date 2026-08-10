import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const noStore = { "Cache-Control": "no-store" };

function hasValidExportSecret(request: Request): boolean {
  if (process.env.MIGRATION_EXPORT_ENABLED !== "true") return false;
  const expected = process.env.MIGRATION_EXPORT_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  return authorization.slice("Bearer ".length) === expected;
}

async function selectRows(
  table: "tournaments" | "registrations" | "participant_recovery_codes",
  columns: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from(table).select(columns).order("created_at", {
    ascending: true,
  });
  if (error) throw new Error(`Unable to export ${table}: ${error.message}`);
  return data ?? [];
}

/**
 * Temporary migration endpoint. It stays disabled unless MIGRATION_EXPORT_ENABLED=true
 * and requires a separate export secret. Delete this route and both variables after import.
 */
export const Route = createFileRoute("/api/migration/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!hasValidExportSecret(request)) {
          return Response.json({ error: "NOT_FOUND" }, { status: 404, headers: noStore });
        }

        try {
          const [tournaments, registrations, recoveryCodes] = await Promise.all([
            selectRows(
              "tournaments",
              "id,code,name,status,results,live_state,live_updated_at,logo_url,created_at,finished_at,recovery_code_prefix",
            ),
            selectRows("registrations", "id,tournament_id,name,created_at"),
            selectRows(
              "participant_recovery_codes",
              "id,tournament_id,name,recovery_code,created_at",
            ),
          ]);
          return Response.json(
            {
              schemaVersion: 1,
              exportedAt: new Date().toISOString(),
              tournaments,
              registrations,
              recoveryCodes,
            },
            { headers: noStore },
          );
        } catch (error) {
          console.error("Migration export failed", error);
          return Response.json({ error: "EXPORT_FAILED" }, { status: 500, headers: noStore });
        }
      },
    },
  },
});
