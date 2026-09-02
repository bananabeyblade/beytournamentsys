import { randomInt } from "node:crypto";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";
import {
  requireRailwayOperator,
  requireRailwayOwner,
  requireRailwayPermanentUser,
  type RailwaySessionUser,
} from "./railway-auth.server";
import { decryptAdminPassword, encryptAdminPassword } from "./admin-password-vault.server";
import type { DeckCombo, PartType } from "./deck";
import { collectComboUsage } from "./combo-usage";
import {
  createOrUpdateRefereeInvite,
  decideReferee,
  getRefereeAccess,
} from "./referee-access.server";
import {
  adminTournamentListStatuses,
  developerStatisticsTournamentStatuses,
} from "./tournament-visibility";
import {
  requireSelectedOrganizationRole,
  requireSelectedTournament,
} from "./selected-organization.server";
import { LEGACY_ORGANIZATION_ID } from "./tenant-onboarding.server";
import { isOwnerEmail } from "./account-id";

type Body = Record<string, unknown>;

export class AdminApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value: unknown, field = "ID") => {
  if (typeof value !== "string" || !uuidPattern.test(value))
    throw new AdminApiError(400, `${field}_INVALID`);
  return value;
};
const text = (value: unknown, field: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new AdminApiError(400, `${field}_INVALID`);
  return value.trim();
};
const json = (value: unknown) => JSON.stringify(value ?? null);
const tournamentColumns =
  "id,code,name,status,results,created_at,finished_at,live_state,live_updated_at,logo_url";

function makeCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

async function audit(
  user: RailwaySessionUser,
  action: string,
  detail: unknown,
  tournamentId?: string,
  tournamentName?: string,
  organizationId?: string,
) {
  let scopedOrganizationId = organizationId;
  if (!scopedOrganizationId && tournamentId) {
    const tournament = await queryPostgres<{ organization_id: string }>(
      "SELECT organization_id FROM tournaments WHERE id=$1 LIMIT 1",
      [tournamentId],
    );
    scopedOrganizationId = tournament.rows[0]?.organization_id;
  }
  await queryPostgres(
    `INSERT INTO admin_actions
       (actor_user_id, actor_email, action, detail, tournament_id, tournament_name, organization_id)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)`,
    [
      user.role === "referee" ? null : user.id,
      user.email,
      action,
      json(detail ?? {}),
      tournamentId ?? null,
      tournamentName ?? null,
      scopedOrganizationId ?? LEGACY_ORGANIZATION_ID,
    ],
  );
}

const immutableRefereeMatchFields = [
  "id",
  "round",
  "index",
  "nextMatchId",
  "nextSlot",
  "kind",
  "loserNextMatchId",
  "loserNextSlot",
] as const;

async function assertRefereeStateMutation(tournamentId: string, state: Body) {
  const current = await queryPostgres<{ live_state: Body }>(
    "SELECT live_state FROM tournaments WHERE id=$1 AND status='open' LIMIT 1",
    [tournamentId],
  );
  if (!current.rows[0]) throw new AdminApiError(404, "OPEN_TOURNAMENT_NOT_FOUND");
  const previous = current.rows[0].live_state ?? {};
  if (
    JSON.stringify(state.players ?? []) !== JSON.stringify(previous.players ?? []) ||
    JSON.stringify(state.removedPlayers ?? []) !== JSON.stringify(previous.removedPlayers ?? []) ||
    Number(state.tableCount) !== Number(previous.tableCount)
  )
    throw new AdminApiError(403, "REFEREE_ROSTER_LOCKED");

  const beforeMatches = Array.isArray(previous.matches) ? previous.matches : [];
  const afterMatches = Array.isArray(state.matches) ? state.matches : [];
  if (beforeMatches.length !== afterMatches.length)
    throw new AdminApiError(403, "REFEREE_BRACKET_LOCKED");
  const beforeById = new Map(
    beforeMatches.map((match) => [String((match as Body).id ?? ""), match as Body]),
  );
  for (const candidate of afterMatches) {
    const match = candidate as Body;
    const before = beforeById.get(String(match.id ?? ""));
    if (
      !before ||
      immutableRefereeMatchFields.some(
        (field) => JSON.stringify(match[field]) !== JSON.stringify(before[field]),
      )
    )
      throw new AdminApiError(403, "REFEREE_BRACKET_LOCKED");
  }
}

export async function railwayAdminGet(request: Request, action: string) {
  const url = new URL(request.url);
  const deckReportTournamentId =
    action === "deck-report" ? uuid(url.searchParams.get("tournamentId"), "TOURNAMENT_ID") : null;
  const user = deckReportTournamentId
    ? await requireRailwayOperator(request, deckReportTournamentId)
    : await requireRailwayPermanentUser(request);
  const organizationOwnerActions = new Set([
    "admins",
    "audit",
    "admin-password",
    "deck-statistics-state",
    "feature-flags",
    "statistics-tournaments",
  ]);
  const selected =
    user.role === "referee"
      ? null
      : await requireSelectedOrganizationRole(
          request,
          organizationOwnerActions.has(action) ? ["owner"] : ["owner", "admin"],
        );
  if (deckReportTournamentId && user.role !== "referee") {
    await requireSelectedTournament(request, deckReportTournamentId);
  }
  if (action === "referee-access")
    return getRefereeAccess(request, url.searchParams.get("tournamentId"));
  if (action === "role") return { role: user.role, user, organization: selected?.organization };
  if (action === "deck-statistics-state") {
    const state = await queryPostgres<{
      reset_at: string;
      updated_by: string | null;
    }>(
      `SELECT reset_at,updated_by_email AS updated_by
       FROM organization_deck_statistics_state WHERE organization_id=$1`,
      [selected!.organization.id],
    );
    const current = state.rows[0];
    if (!current) throw new AdminApiError(500, "DECK_STATISTICS_STATE_MISSING");
    return { resetAt: current.reset_at, updatedBy: current.updated_by };
  }
  if (action === "feature-flags") {
    const flags = await queryPostgres<{ key: string; enabled: boolean; updated_at: string }>(
      `SELECT key,enabled,updated_at FROM organization_feature_flags
       WHERE organization_id=$1 ORDER BY key`,
      [selected!.organization.id],
    );
    return { flags: flags.rows };
  }
  if (action === "tournaments") {
    const latest = url.searchParams.get("latest") === "open";
    const code = url.searchParams.get("code")?.trim().toUpperCase() || null;
    if (code && !/^[A-Z2-9]{6}$/.test(code)) throw new AdminApiError(400, "CODE_INVALID");
    const statuses = adminTournamentListStatuses(latest);
    const result = await queryPostgres(
      `SELECT ${tournamentColumns} FROM tournaments
       WHERE organization_id=$1 AND status = ANY($2::text[])
         AND ($3::text IS NULL OR code=$3)
       ORDER BY created_at DESC LIMIT ${latest || code ? 1 : 50}`,
      [selected!.organization.id, statuses, code],
    );
    return { tournaments: result.rows };
  }
  if (action === "statistics-tournaments") {
    const result = await queryPostgres(
      `SELECT ${tournamentColumns} FROM tournaments
       WHERE organization_id=$1 AND status = ANY($2::text[])
       ORDER BY created_at DESC LIMIT 50`,
      [selected!.organization.id, developerStatisticsTournamentStatuses()],
    );
    return { tournaments: result.rows };
  }
  if (action === "registrations") {
    const tournamentId = uuid(url.searchParams.get("tournamentId"), "TOURNAMENT_ID");
    await requireSelectedTournament(request, tournamentId);
    const result = await queryPostgres(
      "SELECT id,name,created_at FROM registrations WHERE tournament_id=$1 ORDER BY created_at",
      [tournamentId],
    );
    return { registrations: result.rows };
  }
  if (action === "recovery-codes") {
    const tournamentId = uuid(url.searchParams.get("tournamentId"), "TOURNAMENT_ID");
    await requireSelectedTournament(request, tournamentId);
    const result = await queryPostgres(
      "SELECT name,recovery_code FROM participant_recovery_codes WHERE tournament_id=$1 ORDER BY created_at",
      [tournamentId],
    );
    return { recoveryCodes: result.rows };
  }
  if (action === "deck-report") {
    const tournamentId = deckReportTournamentId!;
    const snapshots = await queryPostgres<{
      player_id: string;
      participant_name: string;
      combos: DeckCombo[];
      current_combos: DeckCombo[];
    }>(
      `SELECT snapshot.player_id,
              snapshot.participant_name,
              snapshot.combos,
              COALESCE(current_deck.combos, snapshot.combos, '[]'::jsonb) AS current_combos
       FROM tournament_deck_snapshots snapshot
       LEFT JOIN participant_decks current_deck
         ON current_deck.recovery_code_id = snapshot.recovery_code_id
       WHERE snapshot.tournament_id = $1::uuid
       ORDER BY snapshot.captured_at`,
      [tournamentId],
    );
    // Statistics use immutable Top 8 snapshots. Referees instead use every
    // participant's latest saved Deck directly.  Do not make this depend on
    // a snapshot or on a recovery-code join: older brackets can have a live
    // player id that no longer matches that identity, while the displayed
    // participant name remains stable.
    const refereeDecks = await queryPostgres<{
      player_id: string | null;
      participant_name: string;
      current_combos: DeckCombo[];
    }>(
      `WITH roster AS (
         SELECT player->>'id' AS player_id, player->>'name' AS participant_name
         FROM tournaments tournament
         CROSS JOIN LATERAL jsonb_array_elements(
           COALESCE(tournament.live_state->'players', '[]'::jsonb)
         ) AS player
         WHERE tournament.id = $1::uuid
       )
       SELECT roster.player_id,
              deck.participant_name,
              COALESCE(deck.combos, '[]'::jsonb) AS current_combos
       FROM participant_decks deck
       LEFT JOIN roster
         ON lower(btrim(roster.participant_name)) = lower(btrim(deck.participant_name))
       WHERE deck.tournament_id = $1::uuid
       ORDER BY deck.updated_at DESC`,
      [tournamentId],
    );
    const tournament = await queryPostgres<{ live_state: unknown; results: unknown }>(
      "SELECT live_state,results FROM tournaments WHERE id=$1::uuid LIMIT 1",
      [tournamentId],
    );
    if (!tournament.rowCount) throw new AdminApiError(404, "TOURNAMENT_NOT_FOUND");

    const comboPartFields = [
      "bladeId",
      "lockChipId",
      "mainBladeId",
      "assistBladeId",
      "metalBladeId",
      "overBladeId",
      "ratchetId",
      "bitId",
    ] as const;
    const partParticipants = new Map<string, Set<string>>();
    let registeredComboCount = 0;
    for (const snapshot of snapshots.rows) {
      const combos = Array.isArray(snapshot.combos) ? snapshot.combos : [];
      registeredComboCount += combos.length;
      for (const combo of combos) {
        for (const field of comboPartFields) {
          const partId = combo[field];
          if (!partId) continue;
          const names = partParticipants.get(partId) ?? new Set<string>();
          names.add(snapshot.participant_name);
          partParticipants.set(partId, names);
        }
      }
    }
    for (const refereeDeck of refereeDecks.rows) {
      const combos = Array.isArray(refereeDeck.current_combos) ? refereeDeck.current_combos : [];
      for (const combo of combos) {
        for (const field of comboPartFields) {
          const partId = combo[field];
          if (!partId) continue;
          if (!partParticipants.has(partId)) partParticipants.set(partId, new Set<string>());
        }
      }
    }
    const partIds = [...partParticipants.keys()];
    const parts = partIds.length
      ? await queryPostgres<{
          id: string;
          canonical_id: string;
          name: string;
          name_en: string;
          code: string;
          part_type: PartType;
          is_confirmed_variant: boolean;
        }>(
          `SELECT catalog.id,
                  COALESCE(canonical.id, catalog.id) AS canonical_id,
                  COALESCE(canonical.name, catalog.name) AS name,
                  COALESCE(canonical.name_en, catalog.name_en) AS name_en,
                  COALESCE(canonical.code, catalog.functional_code, catalog.code) AS code,
                  COALESCE(canonical.part_type, catalog.part_type) AS part_type,
                  (canonical.id IS NOT NULL) AS is_confirmed_variant
           FROM parts catalog
           LEFT JOIN catalog_part_aliases alias ON alias.catalog_part_id = catalog.id
           LEFT JOIN canonical_parts canonical ON canonical.id = alias.canonical_part_id
           WHERE catalog.id = ANY($1::text[])
             AND NOT EXISTS (SELECT 1 FROM canonical_parts direct WHERE direct.id = catalog.id)
           UNION ALL
           SELECT canonical.id,
                  canonical.id AS canonical_id,
                  canonical.name,
                  canonical.name_en,
                  canonical.code,
                  canonical.part_type,
                  FALSE AS is_confirmed_variant
           FROM canonical_parts canonical
           WHERE canonical.id = ANY($1::text[])`,
          [partIds],
        )
      : { rows: [] };
    const functionalLabel = (part: (typeof parts.rows)[number]) =>
      part.part_type === "bit"
        ? `${part.code}軸`
        : part.part_type === "ratchet"
          ? part.code
          : part.name;
    const partLabels = new Map(
      parts.rows.map((part) => [part.id, functionalLabel(part) || part.name_en || part.code]),
    );
    const partCanonicalIds = Object.fromEntries(
      parts.rows.map((part) => [part.id, part.canonical_id]),
    );
    const canonicalParticipants = new Map<string, Set<string>>();
    const confirmedVariantParticipants = new Map<string, Set<string>>();
    const canonicalRows = new Map<string, (typeof parts.rows)[number]>();
    for (const part of parts.rows) {
      canonicalRows.set(part.canonical_id, part);
      const participants = partParticipants.get(part.id) ?? new Set<string>();
      const functionalParticipants =
        canonicalParticipants.get(part.canonical_id) ?? new Set<string>();
      for (const participant of participants) functionalParticipants.add(participant);
      canonicalParticipants.set(part.canonical_id, functionalParticipants);
      if (part.is_confirmed_variant) {
        const confirmed = confirmedVariantParticipants.get(part.canonical_id) ?? new Set<string>();
        for (const participant of participants) confirmed.add(participant);
        confirmedVariantParticipants.set(part.canonical_id, confirmed);
      }
    }
    const comboBladeLabel = (combo: DeckCombo) => {
      const bladeId =
        combo.bladeId ??
        combo.mainBladeId ??
        combo.overBladeId ??
        combo.metalBladeId ??
        combo.assistBladeId ??
        combo.lockChipId;
      return (bladeId && partLabels.get(bladeId)) || "未指定戰刃";
    };
    const comboLabel = (combo: DeckCombo) =>
      comboPartFields
        .map((field) => combo[field])
        .filter((partId): partId is string => !!partId)
        .map((partId) => partLabels.get(partId) ?? partId)
        .join(" / ");
    const resultValue = tournament.rows[0]?.results;
    const top4 =
      resultValue &&
      typeof resultValue === "object" &&
      Array.isArray((resultValue as { top4?: unknown }).top4)
        ? (resultValue as { top4: Array<{ rank?: unknown; name?: unknown }> }).top4
        : [];
    const ranks = new Map(
      top4
        .filter((entry) => typeof entry.name === "string" && Number.isFinite(Number(entry.rank)))
        .map((entry) => [(entry.name as string).trim().toLowerCase(), Number(entry.rank)]),
    );

    type LivePlayer = { id?: unknown; name?: unknown };
    const live =
      tournament.rows[0]?.live_state && typeof tournament.rows[0].live_state === "object"
        ? (tournament.rows[0].live_state as { players?: unknown; matches?: unknown })
        : {};
    const livePlayers = Array.isArray(live.players) ? (live.players as LivePlayer[]) : [];
    const playerNames = new Map(
      livePlayers
        .filter((player) => typeof player.id === "string" && typeof player.name === "string")
        .map((player) => [player.id as string, player.name as string]),
    );
    const { trackedBattleCount, comboUsage } = collectComboUsage(
      Array.isArray(live.matches) ? live.matches : [],
      playerNames,
    );

    return {
      qualifierCount: snapshots.rowCount,
      registeredComboCount,
      trackedBattleCount,
      snapshots: snapshots.rows.map((snapshot) => ({
        playerId: snapshot.player_id,
        participantName: snapshot.participant_name,
        combos: Array.isArray(snapshot.combos) ? snapshot.combos : [],
        currentCombos: Array.isArray(snapshot.current_combos) ? snapshot.current_combos : [],
        comboLabels: (Array.isArray(snapshot.combos) ? snapshot.combos : []).map(comboLabel),
        currentComboLabels: (Array.isArray(snapshot.current_combos)
          ? snapshot.current_combos
          : []
        ).map(comboLabel),
        comboBladeLabels: (Array.isArray(snapshot.current_combos)
          ? snapshot.current_combos
          : []
        ).map(comboBladeLabel),
        rank: ranks.get(snapshot.participant_name.trim().toLowerCase()),
      })),
      refereeDecks: refereeDecks.rows.map((deck) => {
        const currentCombos = Array.isArray(deck.current_combos) ? deck.current_combos : [];
        return {
          playerId: deck.player_id,
          participantName: deck.participant_name,
          currentCombos,
          comboLabels: currentCombos.map(comboLabel),
          comboBladeLabels: currentCombos.map(comboBladeLabel),
        };
      }),
      partUsage: [...canonicalRows.entries()]
        .filter(([canonicalId]) => (canonicalParticipants.get(canonicalId)?.size ?? 0) > 0)
        .map(([canonicalId, part]) => ({
          id: canonicalId,
          name: functionalLabel(part),
          nameEn: part.name_en,
          code: part.code,
          partType: part.part_type,
          participantCount: canonicalParticipants.get(canonicalId)?.size ?? 0,
          confirmedVariantParticipantCount:
            confirmedVariantParticipants.get(canonicalId)?.size ?? 0,
        }))
        .sort((a, b) => b.participantCount - a.participantCount || a.name.localeCompare(b.name)),
      partCanonicalIds,
      comboUsage,
    };
  }
  if (action === "admins") {
    const result = await queryPostgres(
      `SELECT r.id,u.id AS user_id,u.email,u.display_name,r.role,r.created_at
       FROM organization_memberships membership
       JOIN app_users u ON u.id=membership.user_id
       LEFT JOIN admin_roles r ON r.user_id=u.id
       WHERE membership.organization_id=$1 AND membership.status='active'
       ORDER BY membership.created_at`,
      [selected!.organization.id],
    );
    return { admins: result.rows };
  }
  if (action === "admin-password") {
    const userId = uuid(url.searchParams.get("userId"), "USER_ID");
    const result = await queryPostgres<{
      password_ciphertext: string | null;
      email: string;
      is_superadmin: boolean;
    }>(
      `SELECT u.password_ciphertext,u.email,bool_or(r.role='superadmin') AS is_superadmin
       FROM app_users u
       JOIN admin_roles r ON r.user_id=u.id
       JOIN organization_memberships membership ON membership.user_id=u.id
       WHERE u.id=$1 AND membership.organization_id=$2 AND membership.status='active'
       GROUP BY u.id,u.password_ciphertext,u.email`,
      [userId, selected!.organization.id],
    );
    if (!result.rows[0]) throw new AdminApiError(404, "ADMIN_NOT_FOUND");
    if (result.rows[0].is_superadmin) await requireRailwayOwner(request);
    const password = result.rows[0].password_ciphertext
      ? decryptAdminPassword(result.rows[0].password_ciphertext)
      : null;
    await audit(
      user,
      "reveal_admin_password",
      { userId, email: result.rows[0].email },
      undefined,
      undefined,
      selected!.organization.id,
    );
    return { password };
  }
  if (action === "audit") {
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
    const actionFilter = url.searchParams.get("action")?.trim() || null;
    const tournamentName = url.searchParams.get("tournamentName")?.trim() || null;
    const result = await queryPostgres(
      `SELECT id,actor_email,action,detail,tournament_name,created_at FROM admin_actions
       WHERE organization_id=$1 AND ($2::text IS NULL OR action=$2)
         AND ($3::text IS NULL OR tournament_name=$3)
       ORDER BY created_at DESC LIMIT $4`,
      [selected!.organization.id, actionFilter, tournamentName, limit],
    );
    return { actions: result.rows };
  }
  throw new AdminApiError(404, "NOT_FOUND");
}

export async function railwayAdminPost(request: Request, action: string, body: Body) {
  if (action === "referee-invite")
    return createOrUpdateRefereeInvite(
      request,
      body.tournamentId,
      body.quota,
      body.rotate === true,
    );
  if (action === "referee-decide") {
    const decision = body.decision;
    if (decision !== "approved" && decision !== "rejected" && decision !== "revoked")
      throw new AdminApiError(400, "REFEREE_DECISION_INVALID");
    return decideReferee(request, body.refereeId, decision);
  }
  const ownerOnlyActions = new Set([
    "create-admin",
    "remove-admin",
    "set-admin-password",
    "delete-tournament",
    "set-feature-flag",
    "reset-deck-statistics",
  ]);
  const operatorActions = new Set(["publish", "finish", "record-audit"]);
  const operatorTournamentId =
    action === "record-audit"
      ? body.tournamentId == null
        ? null
        : uuid(body.tournamentId, "TOURNAMENT_ID")
      : operatorActions.has(action) && body.id != null
        ? uuid(body.id, "TOURNAMENT_ID")
        : null;
  const user =
    operatorActions.has(action) && operatorTournamentId
      ? await requireRailwayOperator(request, operatorTournamentId)
      : await requireRailwayPermanentUser(request);
  const selected =
    user.role === "referee"
      ? null
      : await requireSelectedOrganizationRole(
          request,
          ownerOnlyActions.has(action) ? ["owner"] : ["owner", "admin"],
        );
  if (operatorTournamentId && user.role !== "referee") {
    await requireSelectedTournament(request, operatorTournamentId);
  }
  if (action === "record-audit") {
    const auditAction = text(body.action, "ACTION", 60);
    const tournamentId =
      body.tournamentId == null ? undefined : uuid(body.tournamentId, "TOURNAMENT_ID");
    if (user.role === "referee") {
      const allowed = new Set([
        "match_start",
        "score_add",
        "score_undo",
        "match_confirm",
        "match_lock_force",
      ]);
      if (!allowed.has(auditAction)) throw new AdminApiError(403, "FORBIDDEN");
    }
    await audit(
      user,
      auditAction,
      body.detail,
      tournamentId,
      typeof body.tournamentName === "string" ? body.tournamentName.slice(0, 200) : undefined,
      selected?.organization.id,
    );
    return { ok: true };
  }
  if (action === "set-feature-flag") {
    if (body.key !== "deck_registration" || typeof body.enabled !== "boolean")
      throw new AdminApiError(400, "FEATURE_FLAG_INVALID");
    await queryPostgres(
      `INSERT INTO organization_feature_flags
         (organization_id,key,enabled,updated_at,updated_by_user_id,updated_by_email)
       VALUES ($1,$2,$3,now(),$4,$5)
       ON CONFLICT (organization_id,key) DO UPDATE SET
         enabled=EXCLUDED.enabled,updated_at=EXCLUDED.updated_at,
         updated_by_user_id=EXCLUDED.updated_by_user_id,
         updated_by_email=EXCLUDED.updated_by_email`,
      [selected!.organization.id, body.key, body.enabled, user.id, user.email],
    );
    await audit(
      user,
      "set_feature_flag",
      { key: body.key, enabled: body.enabled },
      undefined,
      undefined,
      selected!.organization.id,
    );
    return { ok: true, enabled: body.enabled };
  }
  if (action === "reset-deck-statistics") {
    if (body.confirmed !== true) throw new AdminApiError(400, "CONFIRMATION_REQUIRED");
    const state = await queryPostgres<{
      reset_at: string;
      updated_by: string | null;
    }>(
      `UPDATE organization_deck_statistics_state
       SET reset_at=now(),updated_at=now(),updated_by_user_id=$2,updated_by_email=$3
       WHERE organization_id=$1
       RETURNING reset_at,updated_by_email AS updated_by`,
      [selected!.organization.id, user.id, user.email],
    );
    const current = state.rows[0];
    if (!current) throw new AdminApiError(500, "DECK_STATISTICS_STATE_MISSING");
    await audit(
      user,
      "reset_deck_statistics",
      { resetAt: current.reset_at },
      undefined,
      undefined,
      selected!.organization.id,
    );
    return { resetAt: current.reset_at, updatedBy: current.updated_by };
  }
  if (action === "create-tournament") {
    const name = text(body.name, "NAME", 60);
    const logoUrl =
      typeof body.logoUrl === "string" && body.logoUrl.trim() ? body.logoUrl.trim() : null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const result = await queryPostgres(
          `INSERT INTO tournaments (organization_id,name,code,created_by,logo_url)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING ${tournamentColumns}`,
          [selected!.organization.id, name, makeCode(), user.id, logoUrl],
        );
        await audit(
          user,
          "create_tournament",
          { name },
          result.rows[0].id as string,
          name,
          selected!.organization.id,
        );
        return { tournament: result.rows[0] };
      } catch (error) {
        if ((error as { code?: string }).code !== "23505" || attempt === 9) throw error;
      }
    }
  }
  if (action === "publish") {
    const id = uuid(body.id);
    if (!body.state || typeof body.state !== "object")
      throw new AdminApiError(400, "STATE_INVALID");
    if (user.role === "referee") await assertRefereeStateMutation(id, body.state as Body);
    await queryPostgres("SELECT merge_tournament_live_state($1,$2::jsonb,$3::timestamptz)", [
      id,
      json(body.state),
      body.stamp ?? new Date().toISOString(),
    ]);
    return { ok: true };
  }
  if (action === "reset") {
    const id = uuid(body.id);
    const tableCount = Math.max(1, Math.min(12, Number(body.tableCount) || 2));
    const result = await queryPostgres<{ name: string }>(
      `UPDATE tournaments SET live_state=jsonb_build_object('players','[]'::jsonb,'matches','[]'::jsonb,
       'tableCount',$2::int,'removedPlayers','[]'::jsonb),live_updated_at=COALESCE($3::timestamptz,now())
       WHERE id=$1 AND organization_id=$4 AND status='open' RETURNING name`,
      [id, tableCount, body.stamp ?? null, selected!.organization.id],
    );
    if (!result.rowCount) throw new AdminApiError(404, "OPEN_TOURNAMENT_NOT_FOUND");
    await audit(
      user,
      "reset_tournament",
      { tableCount },
      id,
      result.rows[0].name,
      selected!.organization.id,
    );
    return { ok: true };
  }
  if (action === "finish") {
    const id = uuid(body.id);
    const result = await queryPostgres(
      `UPDATE tournaments SET status='finished',finished_at=now(),results=$2::jsonb
       WHERE id=$1 AND ($4::uuid IS NULL OR organization_id=$4) AND status='open'
         AND ($3::boolean = false OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(live_state->'matches','[]'::jsonb)) AS match
           WHERE COALESCE(match->>'status','waiting') <> 'done'
         ))
       RETURNING ${tournamentColumns}`,
      [id, json(body.results), user.role === "referee", selected?.organization.id ?? null],
    );
    if (!result.rowCount) throw new AdminApiError(404, "OPEN_TOURNAMENT_NOT_FOUND");
    await audit(
      user,
      "finish_tournament",
      body.results,
      id,
      result.rows[0].name as string,
      selected?.organization.id,
    );
    return { tournament: result.rows[0] };
  }
  if (action === "delete-tournament") {
    const id = uuid(body.id);
    const result = await queryPostgres<{ name: string }>(
      `UPDATE tournaments SET status='archived', finished_at=COALESCE(finished_at, now())
       WHERE id=$1 AND organization_id=$2 RETURNING name`,
      [id, selected!.organization.id],
    );
    if (!result.rowCount) throw new AdminApiError(404, "TOURNAMENT_NOT_FOUND");
    await audit(
      user,
      "delete_tournament",
      {},
      undefined,
      result.rows[0].name,
      selected!.organization.id,
    );
    return { ok: true };
  }
  if (action === "delete-registration") {
    const id = uuid(body.id);
    await withPostgresTransaction(async (client) => {
      const found = await client.query<{ tournament_id: string; name: string }>(
        `SELECT registration.tournament_id,registration.name
         FROM registrations registration
         JOIN tournaments tournament ON tournament.id=registration.tournament_id
         WHERE registration.id=$1 AND tournament.organization_id=$2 FOR UPDATE`,
        [id, selected!.organization.id],
      );
      if (!found.rowCount) throw new AdminApiError(404, "REGISTRATION_NOT_FOUND");
      if (body.keepRecoveryCode !== true)
        await client.query(
          "DELETE FROM participant_recovery_codes WHERE tournament_id=$1 AND lower(btrim(name))=lower(btrim($2))",
          [found.rows[0].tournament_id, found.rows[0].name],
        );
      await client.query("DELETE FROM registrations WHERE id=$1", [id]);
    });
    return { ok: true };
  }
  if (action === "delete-registrations") {
    if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 200)
      throw new AdminApiError(400, "IDS_INVALID");
    const ids = body.ids.map((id) => uuid(id));
    await queryPostgres(
      `DELETE FROM registrations registration
       USING tournaments tournament
       WHERE registration.tournament_id=tournament.id
         AND registration.id=ANY($1::uuid[]) AND tournament.organization_id=$2`,
      [ids, selected!.organization.id],
    );
    return { ok: true, count: ids.length };
  }
  if (action === "create-admin") {
    const role = body.role === "superadmin" ? "superadmin" : "admin";
    const rawAccount = text(body.account ?? body.email, "ACCOUNT", 320).toLowerCase();
    const email = rawAccount.includes("@") ? rawAccount : `${rawAccount}@beyx.local`;
    if (
      rawAccount.includes("@")
        ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawAccount)
        : !/^[a-z0-9_.-]{3,30}$/.test(rawAccount)
    )
      throw new AdminApiError(400, "ACCOUNT_INVALID");
    if (role === "superadmin") await requireRailwayOwner(request);
    if (role === "superadmin" && isOwnerEmail(email))
      throw new AdminApiError(409, "OWNER_GOOGLE_ONLY");
    const password = text(body.password, "PASSWORD", 200);
    if (password.length < 8) throw new AdminApiError(400, "PASSWORD_TOO_SHORT");
    const passwordCiphertext = encryptAdminPassword(password);
    const hashed = await queryPostgres<{ value: string }>(
      "SELECT crypt($1, gen_salt('bf', 12)) AS value",
      [password],
    );
    const passwordHash = hashed.rows[0].value;
    const result = await withPostgresTransaction(async (client) => {
      const upserted = await client.query<{ id: string }>(
        `INSERT INTO app_users(email,display_name,password_hash,password_ciphertext) VALUES($1,$2,$3,$4)
         ON CONFLICT(email) DO UPDATE SET
           display_name=COALESCE(EXCLUDED.display_name,app_users.display_name),
           password_hash=COALESCE(EXCLUDED.password_hash,app_users.password_hash),
           password_ciphertext=COALESCE(EXCLUDED.password_ciphertext,app_users.password_ciphertext)
         RETURNING id`,
        [
          email,
          typeof body.displayName === "string" ? body.displayName.trim() || null : null,
          passwordHash,
          passwordCiphertext,
        ],
      );
      await client.query(
        "INSERT INTO admin_roles(user_id,email,role) VALUES($1,$2,$3) ON CONFLICT(user_id,role) DO NOTHING",
        [upserted.rows[0].id, email, role],
      );
      await client.query(
        `INSERT INTO organization_memberships
           (organization_id,user_id,role,status,created_by)
         VALUES($1,$2,'admin','active',$3)
         ON CONFLICT(organization_id,user_id) DO UPDATE SET
           role='admin',status='active',updated_at=now()`,
        [selected!.organization.id, upserted.rows[0].id, user.id],
      );
      return upserted.rows[0];
    });
    await audit(
      user,
      "create_admin",
      { email, role },
      undefined,
      undefined,
      selected!.organization.id,
    );
    return { ok: true, userId: result.id };
  }
  if (action === "set-admin-password") {
    const userId = uuid(body.userId, "USER_ID");
    const password = text(body.password, "PASSWORD", 200);
    if (password.length < 8) throw new AdminApiError(400, "PASSWORD_TOO_SHORT");
    const target = await queryPostgres<{ email: string; is_superadmin: boolean }>(
      `SELECT u.email,bool_or(r.role='superadmin') AS is_superadmin
       FROM app_users u JOIN admin_roles r ON r.user_id=u.id
       JOIN organization_memberships membership ON membership.user_id=u.id
       WHERE u.id=$1 AND membership.organization_id=$2 AND membership.status='active'
       GROUP BY u.id,u.email`,
      [userId, selected!.organization.id],
    );
    if (!target.rows[0]) throw new AdminApiError(404, "ADMIN_NOT_FOUND");
    if (isOwnerEmail(target.rows[0].email)) throw new AdminApiError(409, "OWNER_GOOGLE_ONLY");
    if (target.rows[0].is_superadmin) await requireRailwayOwner(request);
    const passwordCiphertext = encryptAdminPassword(password);
    await queryPostgres(
      `UPDATE app_users SET password_hash=crypt($2,gen_salt('bf',12)),password_ciphertext=$3
       WHERE id=$1`,
      [userId, password, passwordCiphertext],
    );
    await audit(
      user,
      "set_admin_password",
      { userId, email: target.rows[0].email },
      undefined,
      undefined,
      selected!.organization.id,
    );
    return { ok: true };
  }
  if (action === "remove-admin") {
    const userId = uuid(body.userId, "USER_ID");
    if (userId === user.id) throw new AdminApiError(409, "CANNOT_REMOVE_SELF");
    const target = await queryPostgres<{ email: string; is_superadmin: boolean }>(
      `SELECT u.email, bool_or(r.role='superadmin') AS is_superadmin
       FROM app_users u JOIN admin_roles r ON r.user_id=u.id
       JOIN organization_memberships membership ON membership.user_id=u.id
       WHERE u.id=$1 AND membership.organization_id=$2 AND membership.status='active'
       GROUP BY u.id,u.email`,
      [userId, selected!.organization.id],
    );
    if (!target.rows[0]) throw new AdminApiError(404, "ADMIN_NOT_FOUND");
    if (isOwnerEmail(target.rows[0].email)) throw new AdminApiError(409, "OWNER_CANNOT_BE_REMOVED");
    if (target.rows[0].is_superadmin) await requireRailwayOwner(request);
    await withPostgresTransaction(async (client) => {
      await client.query(
        "DELETE FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",
        [selected!.organization.id, userId],
      );
      await client.query(
        `DELETE FROM admin_roles role WHERE role.user_id=$1 AND NOT EXISTS (
           SELECT 1 FROM organization_memberships membership
           WHERE membership.user_id=$1 AND membership.status='active'
         )`,
        [userId],
      );
    });
    await audit(user, "remove_admin", { userId }, undefined, undefined, selected!.organization.id);
    return { ok: true };
  }
  throw new AdminApiError(404, "NOT_FOUND");
}
