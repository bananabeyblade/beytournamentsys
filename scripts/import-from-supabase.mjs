import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const sourceKey = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!sourceUrl || !sourceKey || !databaseUrl) {
  throw new Error(
    "SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL are required.",
  );
}

const source = createClient(sourceUrl, sourceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const target = new pg.Client({ connectionString: databaseUrl });

async function readAll(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await source
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Supabase ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

const [tournaments, registrations, recoveryCodes] = await Promise.all([
  readAll(
    "tournaments",
    "id,code,name,status,results,live_state,live_updated_at,logo_url,created_at,finished_at,recovery_code_prefix",
  ),
  readAll("registrations", "id,tournament_id,name,created_at"),
  readAll("participant_recovery_codes", "id,tournament_id,name,recovery_code,created_at"),
]);

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      source: {
        tournaments: tournaments.length,
        registrations: registrations.length,
        participantRecoveryCodes: recoveryCodes.length,
      },
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
  await target.query("COMMIT");
  console.log(
    "Import completed. Supabase authentication, storage, and audit rows are intentionally excluded.",
  );
} catch (error) {
  await target.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await target.end();
}
