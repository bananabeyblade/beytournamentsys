import { createHash, randomBytes } from "node:crypto";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  refereeSessionCookie,
  requireRailwayAdmin,
  type RailwaySessionUser,
} from "./railway-auth.server";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");

export class RefereeAccessError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

function tournamentId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new RefereeAccessError(400, "TOURNAMENT_ID_INVALID");
  return value;
}

function quota(value: unknown) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 32)
    throw new RefereeAccessError(400, "REFEREE_QUOTA_INVALID");
  return result;
}

function displayName(value: unknown) {
  if (typeof value !== "string") throw new RefereeAccessError(400, "DISPLAY_NAME_REQUIRED");
  const result = value.trim();
  if (!result || result.length > 40) throw new RefereeAccessError(400, "DISPLAY_NAME_INVALID");
  return result;
}

async function audit(
  user: RailwaySessionUser,
  action: string,
  detail: Record<string, unknown>,
  id: string,
) {
  const tournament = await queryPostgres<{ name: string }>(
    "SELECT name FROM tournaments WHERE id=$1 LIMIT 1",
    [id],
  );
  await queryPostgres(
    `INSERT INTO admin_actions(actor_user_id,actor_email,action,detail,tournament_id,tournament_name)
     VALUES($1,$2,$3,$4::jsonb,$5,$6)`,
    [user.id, user.email, action, JSON.stringify(detail), id, tournament.rows[0]?.name ?? null],
  );
}

export async function getRefereeAccess(request: Request, idInput: unknown) {
  const user = await requireRailwayAdmin(request);
  const id = tournamentId(idInput);
  const invite = await queryPostgres<{
    id: string;
    quota: number;
    revoked_at: string | null;
    expires_at: string | null;
    created_at: string;
  }>(
    `SELECT id,quota,revoked_at,expires_at,created_at FROM tournament_referee_invites
     WHERE tournament_id=$1 LIMIT 1`,
    [id],
  );
  const referees = await queryPostgres(
    `SELECT id,display_name,status,requested_at,decided_at,last_seen_at
     FROM tournament_referees WHERE tournament_id=$1 ORDER BY requested_at`,
    [id],
  );
  return { invite: invite.rows[0] ?? null, referees: referees.rows, viewer: user.id };
}

export async function createOrUpdateRefereeInvite(
  request: Request,
  idInput: unknown,
  quotaInput: unknown,
  rotate: boolean,
) {
  const user = await requireRailwayAdmin(request);
  const id = tournamentId(idInput);
  const maximum = quota(quotaInput);
  const secret = token();
  const result = await withPostgresTransaction(async (client) => {
    const tournament = await client.query<{ code: string; name: string }>(
      "SELECT code,name FROM tournaments WHERE id=$1 AND status='open' FOR UPDATE",
      [id],
    );
    if (!tournament.rows[0]) throw new RefereeAccessError(404, "OPEN_TOURNAMENT_NOT_FOUND");
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM tournament_referee_invites WHERE tournament_id=$1 FOR UPDATE",
      [id],
    );
    const approved = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM tournament_referees
       WHERE tournament_id=$1 AND status='approved'`,
      [id],
    );
    if ((approved.rows[0]?.count ?? 0) > maximum)
      throw new RefereeAccessError(409, "REFEREE_QUOTA_BELOW_APPROVED");
    if (existing.rows[0] && !rotate) {
      await client.query(
        "UPDATE tournament_referee_invites SET quota=$2,updated_at=now() WHERE tournament_id=$1",
        [id, maximum],
      );
      return { code: tournament.rows[0].code, rotated: false };
    }
    if (existing.rows[0]) {
      await client.query(
        `UPDATE tournament_referee_invites SET token_hash=$2,quota=$3,revoked_at=NULL,
         expires_at=NULL,created_by=$4,updated_at=now() WHERE tournament_id=$1`,
        [id, hash(secret), maximum, user.id],
      );
    } else {
      await client.query(
        `INSERT INTO tournament_referee_invites(tournament_id,token_hash,quota,created_by)
         VALUES($1,$2,$3,$4)`,
        [id, hash(secret), maximum, user.id],
      );
    }
    return { code: tournament.rows[0].code, rotated: true };
  });
  await audit(
    user,
    result.rotated ? "referee_invite_create" : "referee_quota_update",
    { quota: maximum },
    id,
  );
  return {
    ok: true,
    quota: maximum,
    joinPath: result.rotated
      ? `/register?t=${encodeURIComponent(result.code)}&ref=${encodeURIComponent(secret)}`
      : null,
  };
}

export async function decideReferee(
  request: Request,
  refereeIdInput: unknown,
  decision: "approved" | "rejected" | "revoked",
) {
  const user = await requireRailwayAdmin(request);
  const refereeId = tournamentId(refereeIdInput);
  const result = await withPostgresTransaction(async (client) => {
    const found = await client.query<{
      tournament_id: string;
      display_name: string;
      quota: number;
    }>(
      `SELECT r.tournament_id,r.display_name,i.quota FROM tournament_referees r
       JOIN tournament_referee_invites i ON i.id=r.invite_id WHERE r.id=$1 FOR UPDATE`,
      [refereeId],
    );
    if (!found.rows[0]) throw new RefereeAccessError(404, "REFEREE_NOT_FOUND");
    if (decision === "approved") {
      const approved = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM tournament_referees
         WHERE tournament_id=$1 AND status='approved' AND id<>$2`,
        [found.rows[0].tournament_id, refereeId],
      );
      if ((approved.rows[0]?.count ?? 0) >= found.rows[0].quota)
        throw new RefereeAccessError(409, "REFEREE_QUOTA_FULL");
    }
    await client.query(
      `UPDATE tournament_referees SET status=$2,decided_at=now(),decided_by=$3 WHERE id=$1`,
      [refereeId, decision, user.id],
    );
    return found.rows[0];
  });
  await audit(
    user,
    `referee_${decision}`,
    { refereeId, name: result.display_name },
    result.tournament_id,
  );
  return { ok: true };
}

export async function requestRefereeAccess(request: Request, body: Record<string, unknown>) {
  await enforceRateLimit(request, "referee-join", 30, 15 * 60);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const inviteToken = typeof body.token === "string" ? body.token.trim() : "";
  const name = displayName(body.displayName);
  if (!/^[A-Z2-9]{6}$/.test(code) || inviteToken.length < 32)
    throw new RefereeAccessError(404, "REFEREE_INVITE_INVALID");
  const sessionToken = token();
  const result = await withPostgresTransaction(async (client) => {
    const invite = await client.query<{
      id: string;
      tournament_id: string;
      quota: number;
      tournament_name: string;
    }>(
      `SELECT i.id,i.tournament_id,i.quota,t.name AS tournament_name
       FROM tournament_referee_invites i JOIN tournaments t ON t.id=i.tournament_id
       WHERE t.code=$1 AND t.status='open' AND i.token_hash=$2 AND i.revoked_at IS NULL
         AND (i.expires_at IS NULL OR i.expires_at>now()) FOR UPDATE`,
      [code, hash(inviteToken)],
    );
    if (!invite.rows[0]) throw new RefereeAccessError(404, "REFEREE_INVITE_INVALID");
    const claimed = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM tournament_referees
       WHERE tournament_id=$1 AND status IN ('pending','approved')`,
      [invite.rows[0].tournament_id],
    );
    if ((claimed.rows[0]?.count ?? 0) >= invite.rows[0].quota)
      throw new RefereeAccessError(409, "REFEREE_QUOTA_FULL");
    try {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO tournament_referees
         (tournament_id,invite_id,display_name,session_token_hash)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [invite.rows[0].tournament_id, invite.rows[0].id, name, hash(sessionToken)],
      );
      await client.query(
        `INSERT INTO admin_actions(actor_email,action,detail,tournament_id,tournament_name)
         VALUES($1,'referee_request',$2::jsonb,$3,$4)`,
        [
          name,
          JSON.stringify({ refereeId: inserted.rows[0].id, name }),
          invite.rows[0].tournament_id,
          invite.rows[0].tournament_name,
        ],
      );
      return inserted.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new RefereeAccessError(409, "REFEREE_NAME_TAKEN");
      throw error;
    }
  });
  return Response.json(
    { ok: true, refereeId: result.id, status: "pending" },
    { headers: { "set-cookie": refereeSessionCookie(sessionToken), "cache-control": "no-store" } },
  );
}
