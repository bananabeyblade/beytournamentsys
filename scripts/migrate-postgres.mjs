import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Railway: set DATABASE_URL=${{Postgres.DATABASE_URL}} on the app service.",
  );
}

const migrationsDir = fileURLToPath(new URL("../database/migrations/", import.meta.url));
const migrationNames = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  // Prevent two overlapping Railway deployments from applying the same file.
  await client.query("SELECT pg_advisory_lock(hashtext('beytournamentsys:migrations')::bigint)");
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query("SELECT name FROM app_migrations")).rows.map((row) => row.name),
  );

  for (const name of migrationNames) {
    if (applied.has(name)) continue;
    const sql = await readFile(`${migrationsDir}${name}`, "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO app_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client
    .query("SELECT pg_advisory_unlock(hashtext('beytournamentsys:migrations')::bigint)")
    .catch(() => undefined);
  await client.end();
}
