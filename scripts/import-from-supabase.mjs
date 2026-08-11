import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const sourceKey = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const sourceExportUrl = process.env.SOURCE_EXPORT_URL;
const sourceExportSecret = process.env.SOURCE_EXPORT_SECRET;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const useExportEndpoint = Boolean(sourceExportUrl || sourceExportSecret);
if (useExportEndpoint && (!sourceExportUrl || !sourceExportSecret)) {
  throw new Error("SOURCE_EXPORT_URL and SOURCE_EXPORT_SECRET must be set together.");
}

if (!useExportEndpoint && (!sourceUrl || !sourceKey)) {
  throw new Error(
    "Configure either SOURCE_EXPORT_URL + SOURCE_EXPORT_SECRET, or SOURCE_SUPABASE_URL + SOURCE_SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const target = new pg.Client({ connectionString: databaseUrl });
let source;

function sourceClient() {
  if (!source) {
    source = createClient(sourceUrl, sourceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return source;
}

async function readFromExportEndpoint() {
  const response = await fetch(sourceExportUrl, {
    headers: {
      Authorization: `Bearer ${sourceExportSecret}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Source export endpoint returned ${response.status}.`);
  const payload = await response.json();
  if (!payload || typeof payload !== "object")
    throw new Error("Source export returned invalid JSON.");
  const {
    tournaments,
    registrations,
    recoveryCodes,
    appUsers,
    adminRoles,
    adminActions,
    storageObjects,
  } = payload;
  if (
    !Array.isArray(tournaments) ||
    !Array.isArray(registrations) ||
    !Array.isArray(recoveryCodes) ||
    !Array.isArray(appUsers) ||
    !Array.isArray(adminRoles) ||
    !Array.isArray(adminActions) ||
    !Array.isArray(storageObjects)
  ) {
    throw new Error("Source export response is missing one or more data sets.");
  }
  return {
    tournaments,
    registrations,
    recoveryCodes,
    appUsers,
    adminRoles,
    adminActions,
    storageObjects,
  };
}

async function readAll(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await sourceClient()
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Supabase ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

const {
  tournaments,
  registrations,
  recoveryCodes,
  appUsers,
  adminRoles,
  adminActions,
  storageObjects,
} = useExportEndpoint
  ? await readFromExportEndpoint()
  : {
      tournaments: await readAll(
        "tournaments",
        "id,code,name,status,results,live_state,live_updated_at,logo_url,created_at,finished_at,recovery_code_prefix",
      ),
      registrations: await readAll("registrations", "id,tournament_id,name,created_at"),
      recoveryCodes: await readAll(
        "participant_recovery_codes",
        "id,tournament_id,name,recovery_code,created_at",
      ),
      appUsers: [],
      adminRoles: await readAll("admin_roles", "id,user_id,email,role,created_at"),
      adminActions: await readAll(
        "admin_actions",
        "id,actor_user_id,actor_email,action,detail,tournament_id,tournament_name,created_at",
      ),
      storageObjects: [],
    };

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      sourceMethod: useExportEndpoint ? "protected-export-endpoint" : "supabase-service-key",
      source: {
        tournaments: tournaments.length,
        registrations: registrations.length,
        participantRecoveryCodes: recoveryCodes.length,
        appUsers: appUsers.length,
        adminRoles: adminRoles.length,
        adminActions: adminActions.length,
        storageObjects: storageObjects.length,
      },
      storageManifest: storageObjects.slice(0, 100),
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log(
    "Dry run only. Re-run with --apply only after reviewing this count and backing up Supabase.",
  );
  process.exit(0);
}

await target.connect();
try {
  await target.query("BEGIN");
  const userIdMap = new Map();
  for (const row of appUsers) {
    const result = await target.query(
      `INSERT INTO app_users (id, email, display_name, created_at, last_login_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET
         display_name=COALESCE(EXCLUDED.display_name, app_users.display_name),
         last_login_at=COALESCE(EXCLUDED.last_login_at, app_users.last_login_at)
       RETURNING id`,
      [row.id, row.email, row.display_name, row.created_at, row.last_sign_in_at],
    );
    userIdMap.set(row.id, result.rows[0].id);
  }

  async function ensureLegacyUser(sourceUserId, email, createdAt) {
    const mapped = userIdMap.get(sourceUserId);
    if (mapped) return mapped;
    const safeEmail = email?.trim() || `legacy-${sourceUserId}@migration.invalid`;
    const result = await target.query(
      `INSERT INTO app_users (id, email, display_name, created_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email
       RETURNING id`,
      [sourceUserId, safeEmail, "Legacy imported account", createdAt],
    );
    const targetUserId = result.rows[0].id;
    userIdMap.set(sourceUserId, targetUserId);
    return targetUserId;
  }

  for (const row of adminRoles) {
    const targetUserId = await ensureLegacyUser(row.user_id, row.email, row.created_at);
    await target.query(
      `INSERT INTO admin_roles (id, user_id, email, role, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, role) DO UPDATE SET email=EXCLUDED.email`,
      [row.id, targetUserId, row.email, row.role, row.created_at],
    );
  }

  for (const row of tournaments) {
    await target.query(
      `INSERT INTO tournaments
       (id, code, name, status, results, live_state, live_updated_at, logo_url, recovery_code_prefix, created_at, finished_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         code=EXCLUDED.code, name=EXCLUDED.name, status=EXCLUDED.status, results=EXCLUDED.results,
         live_state=EXCLUDED.live_state, live_updated_at=EXCLUDED.live_updated_at,
         logo_url=EXCLUDED.logo_url, recovery_code_prefix=EXCLUDED.recovery_code_prefix,
         finished_at=EXCLUDED.finished_at`,
      [
        row.id,
        row.code,
        row.name,
        row.status,
        row.results,
        row.live_state,
        row.live_updated_at,
        row.logo_url,
        row.recovery_code_prefix,
        row.created_at,
        row.finished_at,
      ],
    );
  }
  for (const row of registrations) {
    if (!row.tournament_id) continue;
    await target.query(
      `INSERT INTO registrations (id, tournament_id, name, created_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, created_at=EXCLUDED.created_at`,
      [row.id, row.tournament_id, row.name, row.created_at],
    );
  }
  for (const row of recoveryCodes) {
    await target.query(
      `INSERT INTO participant_recovery_codes (id, tournament_id, name, recovery_code, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, recovery_code=EXCLUDED.recovery_code, created_at=EXCLUDED.created_at`,
      [row.id, row.tournament_id, row.name, row.recovery_code, row.created_at],
    );
  }
  const tournamentIds = new Set(tournaments.map((row) => row.id));
  for (const row of adminActions) {
    const targetUserId = await ensureLegacyUser(row.actor_user_id, row.actor_email, row.created_at);
    await target.query(
      `INSERT INTO admin_actions
       (id, actor_user_id, actor_email, action, detail, tournament_id, tournament_name, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         actor_user_id=EXCLUDED.actor_user_id,
         actor_email=EXCLUDED.actor_email,
         action=EXCLUDED.action,
         detail=EXCLUDED.detail,
         tournament_id=EXCLUDED.tournament_id,
         tournament_name=EXCLUDED.tournament_name`,
      [
        row.id,
        targetUserId,
        row.actor_email,
        row.action,
        row.detail,
        row.tournament_id && tournamentIds.has(row.tournament_id) ? row.tournament_id : null,
        row.tournament_name,
        row.created_at,
      ],
    );
  }
  await target.query("COMMIT");
  console.log(
    "Import completed. Passwords, OAuth tokens, sessions, and storage file contents were not imported.",
  );
} catch (error) {
  await target.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await target.end();
}
