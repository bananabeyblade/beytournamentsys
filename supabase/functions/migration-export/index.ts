/* global Deno */
import { createClient } from "npm:@supabase/supabase-js@2";

const noStoreHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

async function sameSecret(received: string, expected: string): Promise<boolean> {
  const encode = new TextEncoder();
  const [receivedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(received)),
    crypto.subtle.digest("SHA-256", encode.encode(expected)),
  ]);
  const a = new Uint8Array(receivedHash);
  const b = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function denied() {
  // Returning 404 avoids advertising a sensitive, temporary endpoint.
  return Response.json({ error: "NOT_FOUND" }, { status: 404, headers: noStoreHeaders });
}

async function readAll(
  client: ReturnType<typeof createClient>,
  table: "tournaments" | "registrations" | "participant_recovery_codes",
  columns: string,
) {
  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Unable to export ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

/**
 * One-time old-project export. Deploy with verify_jwt=false, keep it disabled by
 * default, and delete MIGRATION_EXPORT_SECRET after the Railway import is verified.
 */
Deno.serve(async (request) => {
  if (request.method !== "GET" || Deno.env.get("MIGRATION_EXPORT_ENABLED") !== "true") {
    return denied();
  }

  const expectedSecret = Deno.env.get("MIGRATION_EXPORT_SECRET");
  const authorization = request.headers.get("authorization");
  if (!expectedSecret || !authorization?.startsWith("Bearer ")) return denied();
  if (!(await sameSecret(authorization.slice("Bearer ".length), expectedSecret))) return denied();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Migration export is missing its Supabase service configuration.");
    return Response.json({ error: "EXPORT_FAILED" }, { status: 500, headers: noStoreHeaders });
  }

  try {
    const source = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [tournaments, registrations, recoveryCodes] = await Promise.all([
      readAll(
        source,
        "tournaments",
        "id,code,name,status,results,live_state,live_updated_at,logo_url,created_at,finished_at,recovery_code_prefix",
      ),
      readAll(source, "registrations", "id,tournament_id,name,created_at"),
      readAll(
        source,
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
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Migration export failed", error);
    return Response.json({ error: "EXPORT_FAILED" }, { status: 500, headers: noStoreHeaders });
  }
});
