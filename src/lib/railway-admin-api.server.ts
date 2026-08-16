import { randomInt } from "node:crypto";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";
import {
  requireRailwayAdmin,
  requireRailwayOperator,
  requireRailwayOwner,
  type RailwaySessionUser,
} from "./railway-auth.server";
import { decryptAdminPassword, encryptAdminPassword } from "./admin-password-vault.server";
import type { DeckCombo, PartType } from "./deck";
import {
  createOrUpdateRefereeInvite,
  decideReferee,
  getRefereeAccess,
} from "./referee-access.server";

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
) {
  await queryPostgres(
    `INSERT INTO admin_actions (actor_user_id, actor_email, action, detail, tournament_id, tournament_name)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6)`,
    [
      user.role === "referee" ? null : user.id,
      user.email,
      action,
      json(detail ?? {}),
      tournamentId ?? null,
      tournamentName ?? null,
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
  const user = await requireRailwayAdmin(
    request,
    action === "admins" || action === "audit" || action === "admin-password",
  );
  const url = new URL(request.url);
  if (action === "referee-access")
    return getRefereeAccess(request, url.searchParams.get("tournamentId"));
  if (action === "role") return { role: user.role, user };
  if (action === "tournaments") {
    const latest = url.searchParams.get("latest") === "open";
    const result = await queryPostgres(
      `SELECT ${tournamentColumns} FROM tournaments ${latest ? "WHERE status = 'open'" : ""}
       ORDER BY created_at DESC LIMIT ${latest ? 1 : 50}`,
    );
    return { tournaments: result.rows };
  }
  if (action === "registrations") {
    const tournamentId = uuid(url.searchParams.get("tournamentId"), "TOURNAMENT_ID");
    const result = await queryPostgres(
      "SELECT id,name,created_at FROM registrations WHERE tournament_id=$1 ORDER BY created_at",
      [tournamentId],
    );
    return { registrations: result.rows };
  }
  if (action === "recovery-codes") {
    const tournamentId = uuid(url.searchParams.get("tournamentId"), "TOURNAMENT_ID");
    const result = await queryPostgres(
      "SELECT name,recovery_code FROM participant_recovery_codes WHERE tournament_id=$1 ORDER BY created_at",
      [tournamentId],
    );
    return { recoveryCodes: result.rows };
  }
  if (action === "deck-report") {
    const tournamentId = uuid(url.searchParams.get("tournamentId"), "TOURNAMENT_ID");
    const snapshots = await queryPostgres<{
      player_id: string;
      participant_name: string;
      combos: DeckCombo[];
    }>(
      `SELECT player_id,participant_name,combos
       FROM tournament_deck_snapshots WHERE tournament_id=$1 ORDER BY captured_at`,
      [tournamentId],
    );
    const tournament = await queryPostgres<{ live_state: unknown; results: unknown }>(
      "SELECT live_state,results FROM tournaments WHERE id=$1 LIMIT 1",
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
    const partIds = [...partParticipants.keys()];
    const parts = partIds.length
      ? await queryPostgres<{
          id: string;
          name: string;
          name_en: string;
          code: string;
          part_type: PartType;
        }>("SELECT id,name,name_en,code,part_type FROM parts WHERE id=ANY($1::uuid[])", [partIds])
      : { rows: [] };
    const partLabels = new Map(
      parts.rows.map((part) => [part.id, part.name || part.name_en || part.code]),
    );
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
    type LiveEvent = { combo1Slot?: unknown; combo2Slot?: unknown };
    type LiveMatch = { p1?: unknown; p2?: unknown; events?: unknown };
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
    const comboCounts = new Map<string, number>();
    let trackedBattleCount = 0;
    for (const match of Array.isArray(live.matches) ? (live.matches as LiveMatch[]) : []) {
      const events = Array.isArray(match.events) ? (match.events as LiveEvent[]) : [];
      for (const event of events) {
        const slot1 = Number(event.combo1Slot);
        const slot2 = Number(event.combo2Slot);
        if (![1, 2, 3].includes(slot1) || ![1, 2, 3].includes(slot2)) continue;
        trackedBattleCount += 1;
        for (const [playerId, slot] of [
          [match.p1, slot1],
          [match.p2, slot2],
        ] as const) {
          if (typeof playerId !== "string") continue;
          const name = playerNames.get(playerId);
          if (!name) continue;
          const key = `${name}\u0000${slot}`;
          comboCounts.set(key, (comboCounts.get(key) ?? 0) + 1);
        }
      }
    }

    return {
      qualifierCount: snapshots.rowCount,
      registeredComboCount,
      trackedBattleCount,
      snapshots: snapshots.rows.map((snapshot) => ({
        playerId: snapshot.player_id,
        participantName: snapshot.participant_name,
        combos: Array.isArray(snapshot.combos) ? snapshot.combos : [],
        comboLabels: (Array.isArray(snapshot.combos) ? snapshot.combos : []).map((combo) =>
          comboPartFields
            .map((field) => combo[field])
            .filter((partId): partId is string => !!partId)
            .map((partId) => partLabels.get(partId) ?? partId)
            .join(" / "),
        ),
        rank: ranks.get(snapshot.participant_name.trim().toLowerCase()),
      })),
      partUsage: parts.rows
        .map((part) => ({
          id: part.id,
          name: part.name,
          nameEn: part.name_en,
          code: part.code,
          partType: part.part_type,
          participantCount: partParticipants.get(part.id)?.size ?? 0,
        }))
        .sort((a, b) => b.participantCount - a.participantCount || a.name.localeCompare(b.name)),
      comboUsage: [...comboCounts.entries()]
        .map(([key, battles]) => {
          const [participantName, rawSlot] = key.split("\u0000");
          return { participantName, slot: Number(rawSlot) as 1 | 2 | 3, battles };
        })
        .sort(
          (a, b) => b.battles - a.battles || a.participantName.localeCompare(b.participantName),
        ),
    };
  }
  if (action === "admins") {
    const result = await queryPostgres(
      `SELECT r.id,u.id AS user_id,u.email,u.display_name,r.role,r.created_at
       FROM admin_roles r JOIN app_users u ON u.id=r.user_id ORDER BY r.created_at`,
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
       WHERE u.id=$1 GROUP BY u.id,u.password_ciphertext,u.email`,
      [userId],
    );
    if (!result.rows[0]) throw new AdminApiError(404, "ADMIN_NOT_FOUND");
    if (result.rows[0].is_superadmin) await requireRailwayOwner(request);
    const password = result.rows[0].password_ciphertext
      ? decryptAdminPassword(result.rows[0].password_ciphertext)
      : null;
    await audit(user, "reveal_admin_password", { userId, email: result.rows[0].email });
    return { password };
  }
  if (action === "audit") {
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
    const actionFilter = url.searchParams.get("action")?.trim() || null;
    const tournamentName = url.searchParams.get("tournamentName")?.trim() || null;
    const result = await queryPostgres(
      `SELECT id,actor_email,action,detail,tournament_name,created_at FROM admin_actions
       WHERE ($1::text IS NULL OR action=$1) AND ($2::text IS NULL OR tournament_name=$2)
       ORDER BY created_at DESC LIMIT $3`,
      [actionFilter, tournamentName, limit],
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
  const superadminActions = new Set([
    "reset",
    "delete-tournament",
    "create-admin",
    "remove-admin",
    "set-admin-password",
  ]);
  const operatorActions = new Set(["publish", "finish", "record-audit"]);
  const operatorTournamentId =
    action === "record-audit"
      ? body.tournamentId == null
        ? null
        : uuid(body.tournamentId, "TOURNAMENT_ID")
      : body.id == null
        ? null
        : uuid(body.id, "TOURNAMENT_ID");
  const user =
    operatorActions.has(action) && operatorTournamentId
      ? await requireRailwayOperator(request, operatorTournamentId)
      : await requireRailwayAdmin(request, superadminActions.has(action));
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
    );
    return { ok: true };
  }
  if (action === "create-tournament") {
    const name = text(body.name, "NAME", 60);
    const logoUrl =
      typeof body.logoUrl === "string" && body.logoUrl.trim() ? body.logoUrl.trim() : null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const result = await queryPostgres(
          `INSERT INTO tournaments (name,code,created_by,logo_url) VALUES ($1,$2,$3,$4)
           RETURNING ${tournamentColumns}`,
          [name, makeCode(), user.id, logoUrl],
        );
        await audit(user, "create_tournament", { name }, result.rows[0].id as string, name);
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
       WHERE id=$1 AND status='open' RETURNING name`,
      [id, tableCount, body.stamp ?? null],
    );
    if (!result.rowCount) throw new AdminApiError(404, "OPEN_TOURNAMENT_NOT_FOUND");
    await audit(user, "reset_tournament", { tableCount }, id, result.rows[0].name);
    return { ok: true };
  }
  if (action === "finish") {
    const id = uuid(body.id);
    const result = await queryPostgres(
      `UPDATE tournaments SET status='finished',finished_at=now(),results=$2::jsonb
       WHERE id=$1 AND status='open'
         AND ($3::boolean = false OR NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(live_state->'matches','[]'::jsonb)) AS match
           WHERE COALESCE(match->>'status','waiting') <> 'done'
         ))
       RETURNING ${tournamentColumns}`,
      [id, json(body.results), user.role === "referee"],
    );
    if (!result.rowCount) throw new AdminApiError(404, "OPEN_TOURNAMENT_NOT_FOUND");
    await audit(user, "finish_tournament", body.results, id, result.rows[0].name as string);
    return { tournament: result.rows[0] };
  }
  if (action === "delete-tournament") {
    const id = uuid(body.id);
    const result = await queryPostgres<{ name: string }>(
      "DELETE FROM tournaments WHERE id=$1 RETURNING name",
      [id],
    );
    if (!result.rowCount) throw new AdminApiError(404, "TOURNAMENT_NOT_FOUND");
    await audit(user, "delete_tournament", {}, undefined, result.rows[0].name);
    return { ok: true };
  }
  if (action === "delete-registration") {
    const id = uuid(body.id);
    await withPostgresTransaction(async (client) => {
      const found = await client.query<{ tournament_id: string; name: string }>(
        "SELECT tournament_id,name FROM registrations WHERE id=$1 FOR UPDATE",
        [id],
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
    await queryPostgres("DELETE FROM registrations WHERE id=ANY($1::uuid[])", [ids]);
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
    if (role === "superadmin" && email === "john410403123@gmail.com")
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
      return upserted.rows[0];
    });
    await audit(user, "create_admin", { email, role });
    return { ok: true, userId: result.id };
  }
  if (action === "set-admin-password") {
    const userId = uuid(body.userId, "USER_ID");
    const password = text(body.password, "PASSWORD", 200);
    if (password.length < 8) throw new AdminApiError(400, "PASSWORD_TOO_SHORT");
    const target = await queryPostgres<{ email: string; is_superadmin: boolean }>(
      `SELECT u.email,bool_or(r.role='superadmin') AS is_superadmin
       FROM app_users u JOIN admin_roles r ON r.user_id=u.id
       WHERE u.id=$1 GROUP BY u.id,u.email`,
      [userId],
    );
    if (!target.rows[0]) throw new AdminApiError(404, "ADMIN_NOT_FOUND");
    if (target.rows[0].email.toLowerCase() === "john410403123@gmail.com")
      throw new AdminApiError(409, "OWNER_GOOGLE_ONLY");
    if (target.rows[0].is_superadmin) await requireRailwayOwner(request);
    const passwordCiphertext = encryptAdminPassword(password);
    await queryPostgres(
      `UPDATE app_users SET password_hash=crypt($2,gen_salt('bf',12)),password_ciphertext=$3
       WHERE id=$1`,
      [userId, password, passwordCiphertext],
    );
    await audit(user, "set_admin_password", { userId, email: target.rows[0].email });
    return { ok: true };
  }
  if (action === "remove-admin") {
    const userId = uuid(body.userId, "USER_ID");
    if (userId === user.id) throw new AdminApiError(409, "CANNOT_REMOVE_SELF");
    const target = await queryPostgres<{ email: string; is_superadmin: boolean }>(
      `SELECT u.email, bool_or(r.role='superadmin') AS is_superadmin
       FROM app_users u JOIN admin_roles r ON r.user_id=u.id
       WHERE u.id=$1 GROUP BY u.id,u.email`,
      [userId],
    );
    if (!target.rows[0]) throw new AdminApiError(404, "ADMIN_NOT_FOUND");
    if (target.rows[0].email.toLowerCase() === "john410403123@gmail.com")
      throw new AdminApiError(409, "OWNER_CANNOT_BE_REMOVED");
    if (target.rows[0].is_superadmin) await requireRailwayOwner(request);
    await queryPostgres("DELETE FROM admin_roles WHERE user_id=$1", [userId]);
    await audit(user, "remove_admin", { userId });
    return { ok: true };
  }
  throw new AdminApiError(404, "NOT_FOUND");
}
