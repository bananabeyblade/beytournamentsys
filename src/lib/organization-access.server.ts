import { queryPostgres } from "@/integrations/postgres/client.server";
import { readRailwaySession, type RailwaySessionUser } from "./railway-auth.server";
import {
  organizationAccessAllows,
  type OrganizationAccess,
  type OrganizationRole,
} from "./organization-access";

const ORGANIZATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function forbidden(code: string, status: number) {
  return Object.assign(new Error(code), { status });
}

async function accessForUser(userId: string, organizationId: string): Promise<OrganizationAccess> {
  const result = await queryPostgres<OrganizationAccess>(
    `SELECT
       (
         SELECT membership.role::text
         FROM organization_memberships membership
         WHERE membership.user_id = $1
           AND membership.organization_id = $2
           AND membership.status = 'active'
         LIMIT 1
       ) AS "organizationRole",
       (
         SELECT role.role::text
         FROM platform_roles role
         WHERE role.user_id = $1 AND role.role = 'developer'
         LIMIT 1
       ) AS "platformRole"`,
    [userId, organizationId],
  );
  return result.rows[0] ?? { organizationRole: null, platformRole: null };
}

export async function requireRailwayOrganizationMember(
  request: Request,
  organizationId: string,
  allowedRoles: readonly OrganizationRole[] = ["owner", "admin"],
): Promise<RailwaySessionUser> {
  if (!ORGANIZATION_ID.test(organizationId)) throw forbidden("ORGANIZATION_ID_INVALID", 400);
  const user = await readRailwaySession(request);
  if (!user) throw forbidden("AUTH_REQUIRED", 401);
  if (user.role === "referee") throw forbidden("FORBIDDEN", 403);
  const access = await accessForUser(user.id, organizationId);
  if (!organizationAccessAllows(access, allowedRoles)) throw forbidden("FORBIDDEN", 403);
  return user;
}

/**
 * Resolve the tenant from the trusted tournament row before authorizing it.
 * Callers must not use a client-supplied organization id as proof of access.
 */
export async function requireRailwayTournamentTenantMember(
  request: Request,
  tournamentId: string,
  allowedRoles: readonly OrganizationRole[] = ["owner", "admin"],
) {
  if (!ORGANIZATION_ID.test(tournamentId)) throw forbidden("TOURNAMENT_ID_INVALID", 400);
  const tournament = await queryPostgres<{ organizationId: string }>(
    `SELECT organization_id AS "organizationId"
     FROM tournaments WHERE id = $1 LIMIT 1`,
    [tournamentId],
  );
  const organizationId = tournament.rows[0]?.organizationId;
  if (!organizationId) throw forbidden("TOURNAMENT_NOT_FOUND", 404);
  const user = await requireRailwayOrganizationMember(request, organizationId, allowedRoles);
  return { user, organizationId };
}
