import { randomInt } from "node:crypto";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";
import { requireRailwayAdmin, type RailwaySessionUser } from "./railway-auth.server";

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
    [user.id, user.email, action, json(detail ?? {}), tournamentId ?? null, tournamentName ?? null],
  );
}

export async function railwayAdminGet(request: Request, action: string) {
  const user = await requireRailwayAdmin(request, action === "admins" || action === "audit");
  const url = new URL(request.url);
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
  if (action === "admins") {
    const result = await queryPostgres(
      `SELECT r.id,u.id AS user_id,u.email,u.display_name,r.role,r.created_at
       FROM admin_roles r JOIN app_users u ON u.id=r.user_id ORDER BY r.created_at`,
    );
    return { admins: result.rows };
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
  const superadminActions = new Set(["reset", "delete-tournament", "create-admin", "remove-admin"]);
  const user = await requireRailwayAdmin(request, superadminActions.has(action));
  if (action === "record-audit") {
    const auditAction = text(body.action, "ACTION", 60);
    const tournamentId =
      body.tournamentId == null ? undefined : uuid(body.tournamentId, "TOURNAMENT_ID");
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
       WHERE id=$1 AND status='open' RETURNING ${tournamentColumns}`,
      [id, json(body.results)],
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
    const email = text(body.email, "EMAIL", 320).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AdminApiError(400, "EMAIL_INVALID");
    const role = body.role === "superadmin" ? "superadmin" : "admin";
    const result = await withPostgresTransaction(async (client) => {
      const upserted = await client.query<{ id: string }>(
        `INSERT INTO app_users(email,display_name) VALUES($1,$2)
         ON CONFLICT(email) DO UPDATE SET display_name=COALESCE(EXCLUDED.display_name,app_users.display_name)
         RETURNING id`,
        [email, typeof body.displayName === "string" ? body.displayName.trim() || null : null],
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
  if (action === "remove-admin") {
    const userId = uuid(body.userId, "USER_ID");
    if (userId === user.id) throw new AdminApiError(409, "CANNOT_REMOVE_SELF");
    await queryPostgres("DELETE FROM admin_roles WHERE user_id=$1", [userId]);
    await audit(user, "remove_admin", { userId });
    return { ok: true };
  }
  throw new AdminApiError(404, "NOT_FOUND");
}
