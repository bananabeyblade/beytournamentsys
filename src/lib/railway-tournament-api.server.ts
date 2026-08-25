import type { PoolClient } from "pg";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";
import { generateRecoveryCode } from "./recovery-code.server";
import type { DeckCombo, PartType } from "./deck";

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
  if (!normalizedCode) throw new ApiError(400, "TOURNAMENT_CODE_REQUIRED");
  const result = await queryPostgres<PublicTournament>(
    `SELECT ${tournamentColumns} FROM tournaments WHERE code = $1 AND status <> 'archived' LIMIT 1`,
    [normalizedCode],
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
    const tournament = await client.query<{
      recovery_code_prefix: string;
      roster_count: number;
      match_count: number;
    }>(
      `SELECT recovery_code_prefix,
         jsonb_array_length(COALESCE(live_state->'players','[]'::jsonb))::int AS roster_count,
         jsonb_array_length(COALESCE(live_state->'matches','[]'::jsonb))::int AS match_count
       FROM tournaments WHERE id = $1 AND status = 'open' FOR UPDATE`,
      [tournamentId],
    );
    const row = tournament.rows[0];
    const prefix = row?.recovery_code_prefix;
    if (!prefix) throw new ApiError(404, "OPEN_TOURNAMENT_NOT_FOUND");
    if (row.match_count > 0) throw new ApiError(409, "REGISTRATION_CLOSED");
    const pending = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM registrations WHERE tournament_id=$1",
      [tournamentId],
    );
    const configuredMax = Number(process.env.MAX_TOURNAMENT_REGISTRATIONS ?? 128);
    const maxRegistrations = Math.min(
      Math.max(Number.isFinite(configuredMax) ? configuredMax : 128, 16),
      1024,
    );
    if (row.roster_count + (pending.rows[0]?.count ?? 0) >= maxRegistrations)
      throw new ApiError(409, "TOURNAMENT_FULL");
    if (await nameTaken(client, tournamentId, name)) throw new ApiError(409, "DUPLICATE");

    let recoveryCode: string | undefined;
    for (let attempts = 0; attempts < 20; attempts += 1) {
      const candidate = generateRecoveryCode(prefix);
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

type PartRow = {
  id: string;
  name: string;
  name_en: string;
  code: string;
  part_type: PartType;
  system: string;
  release_date: string | null;
  source_part_id: string;
  functional_code: string;
  package_id: string;
  set_id: string;
  color: string;
  brand_source: string;
};

export async function listActiveParts() {
  const { rows } = await queryPostgres<PartRow>(
    `SELECT id, name, name_en, code, part_type, system, release_date,
            '' AS source_part_id, code AS functional_code, '' AS package_id, '' AS set_id,
            '' AS color, 'canonical' AS brand_source
     FROM canonical_parts WHERE active = TRUE
     UNION ALL
     SELECT id, name, name_en, code, part_type, system, release_date,
            source_part_id, functional_code, package_id, set_id, color, brand_source
     FROM parts
     WHERE active = TRUE
       AND NOT EXISTS (SELECT 1 FROM canonical_parts WHERE active = TRUE)
     ORDER BY part_type, release_date DESC NULLS LAST, name_en, code`,
  );
  return {
    parts: rows.map((part) => ({
      id: part.id,
      name: part.name,
      nameEn: part.name_en,
      code: part.code,
      partType: part.part_type,
      system: part.system,
      sourcePartId: part.source_part_id,
      functionalCode: part.functional_code,
      packageId: part.package_id,
      setId: part.set_id,
      color: part.color,
      brandSource: part.brand_source,
    })),
  };
}

export async function deckRegistrationEnabled() {
  const { rows } = await queryPostgres<{ enabled: boolean }>(
    "SELECT enabled FROM app_feature_flags WHERE key='deck_registration' LIMIT 1",
  );
  return rows[0]?.enabled ?? true;
}

function recoveryCode(value: unknown): string {
  if (typeof value !== "string" || !/^\d{8}$/.test(value.trim())) {
    throw new ApiError(400, "RECOVERY_CODE_INVALID");
  }
  return value.trim();
}

async function participantIdentity(
  client: PoolClient,
  tournamentId: string,
  name: string,
  code: string,
) {
  const { rows } = await client.query<{ id: string }>(
    `SELECT c.id FROM participant_recovery_codes c
     JOIN tournaments t ON t.id = c.tournament_id
     WHERE c.tournament_id = $1 AND t.status = 'open'
       AND lower(btrim(c.name)) = lower(btrim($2)) AND c.recovery_code = $3
     LIMIT 1`,
    [tournamentId, name, code],
  );
  if (!rows[0]) throw new ApiError(403, "PARTICIPANT_CREDENTIAL_INVALID");
  return rows[0].id;
}

const partFields: Array<[keyof DeckCombo, PartType, boolean]> = [
  ["bladeId", "blade", false],
  ["lockChipId", "lock_chip", false],
  ["mainBladeId", "main_blade", false],
  ["assistBladeId", "assist_blade", false],
  ["metalBladeId", "metal_blade", true],
  ["overBladeId", "over_blade", true],
  ["ratchetId", "ratchet", false],
  ["bitId", "bit", false],
];

async function validatedCombos(client: PoolClient, input: unknown): Promise<DeckCombo[]> {
  if (!Array.isArray(input) || input.length < 1 || input.length > 3) {
    throw new ApiError(400, "DECK_COMBOS_INVALID");
  }
  const combos = input.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiError(400, "DECK_COMBO_INVALID");
    }
    const raw = value as Record<string, unknown>;
    const mode = raw.mode === "custom" ? "custom" : raw.mode === "standard" ? "standard" : null;
    if (!mode) throw new ApiError(400, "DECK_MODE_INVALID");
    const combo: Record<string, unknown> = { slot: index + 1, mode };
    for (const [field] of partFields) {
      const partId = raw[field];
      if (typeof partId === "string" && partId.trim()) combo[field] = partId.trim();
    }
    if (!combo.ratchetId || !combo.bitId) throw new ApiError(400, "DECK_PART_REQUIRED");
    if (mode === "standard" && !combo.bladeId) throw new ApiError(400, "DECK_BLADE_REQUIRED");
    if (mode === "custom" && (!combo.lockChipId || !combo.mainBladeId || !combo.assistBladeId)) {
      throw new ApiError(400, "DECK_CUSTOM_BLADE_REQUIRED");
    }
    return combo as unknown as DeckCombo;
  });

  const requested = new Map<string, PartType>();
  for (const combo of combos) {
    for (const [field, expectedType, optional] of partFields) {
      const id = combo[field];
      if (typeof id === "string" && id) requested.set(id, expectedType);
      else if (!optional && field !== "bladeId" && combo.mode === "standard") continue;
    }
  }
  const ids = [...requested.keys()];
  const { rows } = await client.query<{ id: string; part_type: PartType }>(
    `SELECT id, part_type FROM canonical_parts WHERE active = TRUE AND id = ANY($1::text[])
     UNION ALL
     SELECT id, part_type FROM parts WHERE active = TRUE AND id = ANY($1::text[])`,
    [ids],
  );
  const found = new Map(rows.map((row) => [row.id, row.part_type]));
  for (const [id, expectedType] of requested) {
    if (found.get(id) !== expectedType) throw new ApiError(400, "DECK_PART_INVALID");
  }
  return combos;
}

export async function loadPublicParticipantDeck(
  tournamentIdInput: unknown,
  nameInput: unknown,
  codeInput: unknown,
) {
  const tournamentId = uuid(tournamentIdInput, "tournament_id");
  const name = cleanName(nameInput);
  const code = recoveryCode(codeInput);
  return withPostgresTransaction(async (client) => {
    const recoveryCodeId = await participantIdentity(client, tournamentId, name, code);
    const { rows } = await client.query<{ combos: DeckCombo[] }>(
      "SELECT combos FROM participant_decks WHERE recovery_code_id = $1 LIMIT 1",
      [recoveryCodeId],
    );
    const lock = await client.query<{ locked: boolean }>(
      "SELECT status <> 'open' AS locked FROM tournaments WHERE id = $1",
      [tournamentId],
    );
    return {
      combos: Array.isArray(rows[0]?.combos) ? rows[0].combos : [],
      locked: lock.rows[0]?.locked === true,
    };
  });
}

export async function savePublicParticipantDeck(
  tournamentIdInput: unknown,
  nameInput: unknown,
  codeInput: unknown,
  combosInput: unknown,
) {
  if (!(await deckRegistrationEnabled())) throw new ApiError(403, "DECK_REGISTRATION_DISABLED");
  const tournamentId = uuid(tournamentIdInput, "tournament_id");
  const name = cleanName(nameInput);
  const code = recoveryCode(codeInput);
  return withPostgresTransaction(async (client) => {
    const recoveryCodeId = await participantIdentity(client, tournamentId, name, code);
    const lock = await client.query<{ locked: boolean }>(
      "SELECT status <> 'open' AS locked FROM tournaments WHERE id = $1 FOR SHARE",
      [tournamentId],
    );
    if (lock.rows[0]?.locked) throw new ApiError(409, "DECK_LOCKED");
    const combos = await validatedCombos(client, combosInput);
    await client.query(
      `INSERT INTO participant_decks
         (recovery_code_id, tournament_id, participant_name, combos)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (recovery_code_id) DO UPDATE SET
         participant_name = EXCLUDED.participant_name,
         combos = EXCLUDED.combos,
         updated_at = now()`,
      [recoveryCodeId, tournamentId, name, JSON.stringify(combos)],
    );
    // A Top 8 player can submit their Deck after qualifying. Preserve any
    // non-empty historical snapshot, but repair the empty one immediately so
    // referees can see the newly registered choices in the current match.
    await client.query(
      `UPDATE tournament_deck_snapshots
       SET recovery_code_id = COALESCE(recovery_code_id, $2),
           combos = $3::jsonb
       WHERE tournament_id = $1
         AND recovery_code_id = $2
         AND jsonb_array_length(COALESCE(combos, '[]'::jsonb)) = 0`,
      [tournamentId, recoveryCodeId, JSON.stringify(combos)],
    );
    return { saved: true };
  });
}
