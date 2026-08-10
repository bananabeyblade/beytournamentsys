import type { PoolClient } from "pg";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";

export type PublicTournament = {
  id: string;
  code: string;
  name: string;
  status: "open" | "finished";
  results: unknown;
  live_state: unknown;
  live_updated_at: string | null;
  logo_url: string | null;
  created_at: string;
  finished_at: string | null;
};

const tournamentColumns = `
  id, code, name, status, results, live_state, live_updated_at, logo_url, created_at, finished_at
`;

function cleanName(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "NAME_REQUIRED");
  const name = value.trim();
  if (name.length < 1 || name.length > 40) throw new ApiError(400, "NAME_INVALID");
  return name;
}

function uuid(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new ApiError(400, `${field.toUpperCase()}_INVALID`);
  }
  return value;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export async function listPublicTournaments(code?: string): Promise<PublicTournament[]> {
  const normalizedCode = code?.trim().toUpperCase();
  const result = normalizedCode
    ? await queryPostgres<PublicTournament>(
        `SELECT ${tournamentColumns} FROM tournaments WHERE code = $1 LIMIT 1`,
        [normalizedCode],
      )
    : await queryPostgres<PublicTournament>(
        `SELECT ${tournamentColumns} FROM tournaments ORDER BY created_at DESC LIMIT 50`,
      );
  return result.rows;
}

async function nameTaken(client: PoolClient, tournamentId: string, name: string): Promise<boolean> {
  const { rows } = await client.query<{ taken: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM registrations WHERE tournament_id = $1 AND lower(btrim(name)) = lower(btrim($2))
      UNION ALL
      SELECT 1 FROM participant_recovery_codes WHERE tournament_id = $1 AND lower(btrim(name)) = lower(btrim($2))
    ) AS taken`,
    [tournamentId, name],
  );
  return rows[0]?.taken === true;
}

export async function registrationNameTaken(tournamentIdInput: unknown, nameInput: unknown) {
  const tournamentId = uuid(tournamentIdInput, "tournament_id");
  const name = cleanName(nameInput);
  return withPostgresTransaction(async (client) => ({
    taken: await nameTaken(client, tournamentId, name),
  }));
}

export async function createPublicRegistration(tournamentIdInput: unknown, nameInput: unknown) {
  const tournamentId = uuid(tournamentIdInput, "tournament_id");
  const name = cleanName(nameInput);

  return withPostgresTransaction(async (client) => {
    const tournament = await client.query<{ recovery_code_prefix: string }>(
      "SELECT recovery_code_prefix FROM tournaments WHERE id = $1 AND status = 'open' FOR UPDATE",
      [tournamentId],
    );
    const prefix = tournament.rows[0]?.recovery_code_prefix;
    if (!prefix) throw new ApiError(404, "OPEN_TOURNAMENT_NOT_FOUND");
    if (await nameTaken(client, tournamentId, name)) throw new ApiError(409, "DUPLICATE");

    let recoveryCode: string | undefined;
    for (let attempts = 0; attempts < 20; attempts += 1) {
      const suffix = Math.floor(Math.random() * 10_000)
        .toString()
        .padStart(4, "0");
      const candidate = `${prefix}${suffix}`;
      const inserted = await client.query(
        `INSERT INTO participant_recovery_codes (tournament_id, name, recovery_code)
         VALUES ($1, $2, $3)
         ON CONFLICT (tournament_id, recovery_code) DO NOTHING
         RETURNING recovery_code`,
        [tournamentId, name, candidate],
      );
      if (inserted.rowCount) {
        recoveryCode = candidate;
        break;
      }
    }
    if (!recoveryCode) throw new ApiError(503, "RECOVERY_CODE_UNAVAILABLE");

    await client.query("INSERT INTO registrations (tournament_id, name) VALUES ($1, $2)", [
      tournamentId,
      name,
    ]);
    return { recoveryCode };
  });
}

export async function claimPublicRecoveryCode(
  tournamentIdInput: unknown,
  nameInput: unknown,
  codeInput: unknown,
) {
  const tournamentId = uuid(tournamentIdInput, "tournament_id");
  const name = cleanName(nameInput);
  if (typeof codeInput !== "string" || !/^\d{8}$/.test(codeInput.trim())) {
    throw new ApiError(400, "RECOVERY_CODE_INVALID");
  }
  const { rows } = await queryPostgres<{ claimed: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM participant_recovery_codes c
      JOIN tournaments t ON t.id = c.tournament_id
      WHERE c.tournament_id = $1 AND t.status = 'open'
        AND lower(btrim(c.name)) = lower(btrim($2)) AND c.recovery_code = $3
    ) AS claimed`,
    [tournamentId, name, codeInput.trim()],
  );
  return { claimed: rows[0]?.claimed === true };
}
