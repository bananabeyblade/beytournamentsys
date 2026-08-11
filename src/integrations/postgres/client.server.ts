import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "Missing DATABASE_URL. Add ${{Postgres.DATABASE_URL}} to the Railway app service.",
    );
  }
  return value;
}

/**
 * Server-only PostgreSQL pool for Railway. Never import this module from a
 * browser component: DATABASE_URL must remain inside the Railway service.
 */
export function getPostgresPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: Math.min(Math.max(Number(process.env.DATABASE_POOL_MAX ?? 5), 1), 20),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export async function postgresHealthcheck(): Promise<void> {
  await getPostgresPool().query("SELECT 1");
}

/** Readiness checks the schema the running application actually requires. */
export async function postgresReadinessCheck(): Promise<void> {
  const result = await getPostgresPool().query<{ ready: boolean }>(`
    SELECT
      to_regclass('public.app_users') IS NOT NULL
      AND to_regclass('public.app_sessions') IS NOT NULL
      AND to_regclass('public.admin_roles') IS NOT NULL
      AND to_regclass('public.tournaments') IS NOT NULL
      AND to_regclass('public.registrations') IS NOT NULL
      AND to_regclass('public.participant_recovery_codes') IS NOT NULL
      AND to_regclass('public.request_rate_limits') IS NOT NULL
      AND to_regprocedure('public.merge_tournament_live_state(uuid,jsonb,timestamptz)') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='app_users'
          AND column_name='password_ciphertext'
      ) AS ready
  `);
  if (result.rows[0]?.ready !== true) throw new Error("DATABASE_SCHEMA_NOT_READY");
}

export async function queryPostgres<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
) {
  return getPostgresPool().query<Row>(text, [...values]);
}

export async function withPostgresTransaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
