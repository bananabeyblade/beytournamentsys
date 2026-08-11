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
  table:
    | "tournaments"
    | "registrations"
    | "participant_recovery_codes"
    | "admin_roles"
    | "admin_actions",
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

async function readAuthUsers(client: ReturnType<typeof createClient>) {
  const users: Array<{
    id: string;
    email: string;
    display_name: string | null;
    created_at: string;
    last_sign_in_at: string | null;
  }> = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Unable to export auth users: ${error.message}`);
    for (const user of data.users) {
      if (!user.email) continue;
      const metadata = user.user_metadata ?? {};
      const displayName = [metadata.full_name, metadata.name, metadata.user_name].find(
        (value) => typeof value === "string" && value.trim(),
      );
      users.push({
        id: user.id,
        email: user.email,
        display_name: typeof displayName === "string" ? displayName.slice(0, 120) : null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < perPage) return users;
  }
}

async function readStorageManifest(client: ReturnType<typeof createClient>) {
  const { data: buckets, error: bucketError } = await client.storage.listBuckets();
  if (bucketError) throw new Error(`Unable to list storage buckets: ${bucketError.message}`);

  const objects: Array<{ bucket_id: string; name: string; size: number | null }> = [];
  for (const bucket of buckets ?? []) {
    const prefixes = [""];
    while (prefixes.length > 0) {
      const prefix = prefixes.shift() ?? "";
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await client.storage.from(bucket.id).list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new Error(`Unable to list storage bucket ${bucket.id}: ${error.message}`);
        for (const item of data ?? []) {
          const name = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id) {
            const size = item.metadata?.size;
            objects.push({
              bucket_id: bucket.id,
              name,
              size: typeof size === "number" ? size : null,
            });
          } else {
            prefixes.push(name);
          }
        }
        if ((data ?? []).length < 1000) break;
      }
    }
  }
  return objects;
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
    const [
      tournaments,
      registrations,
      recoveryCodes,
      appUsers,
      adminRoles,
      adminActions,
      storageObjects,
    ] = await Promise.all([
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
      readAuthUsers(source),
      readAll(source, "admin_roles", "id,user_id,email,role,created_at"),
      readAll(
        source,
        "admin_actions",
        "id,actor_user_id,actor_email,action,detail,tournament_id,tournament_name,created_at",
      ),
      readStorageManifest(source),
    ]);
    return Response.json(
      {
        schemaVersion: 2,
        exportedAt: new Date().toISOString(),
        tournaments,
        registrations,
        recoveryCodes,
        appUsers,
        adminRoles,
        adminActions,
        storageObjects,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Migration export failed", error);
    return Response.json({ error: "EXPORT_FAILED" }, { status: 500, headers: noStoreHeaders });
  }
});
