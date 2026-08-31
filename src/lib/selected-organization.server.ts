import type { QueryResultRow } from "pg";
import { queryPostgres } from "../integrations/postgres/client.server";
import { readRailwaySession, type RailwaySessionUser } from "./railway-auth.server";
import type { OrganizationRole } from "./organization-access";
import { LEGACY_ORGANIZATION_ID } from "./tenant-onboarding.server";

export const ORGANIZATION_COOKIE = "beyx_organization";
const ORGANIZATION_SECONDS = 60 * 60 * 24 * 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SelectedOrganizationError extends Error {
  constructor(
    public readonly status: number,
    code: string,
  ) {
    super(code);
  }
}

export interface SelectedOrganization {
  id: string;
  slug: string;
  name: string;
  role: OrganizationRole;
}

type Query = <Row extends QueryResultRow>(
  text: string,
  values?: readonly unknown[],
) => Promise<{ rows: Row[] }>;

export interface SelectedOrganizationDependencies {
  readSession: (request: Request) => Promise<RailwaySessionUser | null>;
  query: Query;
}

const productionDependencies: SelectedOrganizationDependencies = {
  readSession: readRailwaySession,
  query: queryPostgres,
};

function fail(status: number, code: string): never {
  throw new SelectedOrganizationError(status, code);
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      const value = rest.join("=");
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

export function selectedOrganizationCookie(organizationId: string): string {
  if (!UUID.test(organizationId)) fail(400, "ORGANIZATION_ID_INVALID");
  return `${ORGANIZATION_COOKIE}=${encodeURIComponent(organizationId)}; Path=/; Max-Age=${ORGANIZATION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSelectedOrganizationCookie(): string {
  return `${ORGANIZATION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function permanentUser(request: Request, dependencies: SelectedOrganizationDependencies) {
  const user = await dependencies.readSession(request);
  if (!user) fail(401, "AUTH_REQUIRED");
  if (user.role === "referee") fail(403, "FORBIDDEN");
  return user;
}

async function membership(
  userId: string,
  organizationId: string | null,
  dependencies: SelectedOrganizationDependencies,
) {
  const result = await dependencies.query<SelectedOrganization>(
    `SELECT organization.id, organization.slug, organization.name,
            membership.role::text AS role
     FROM organization_memberships membership
     JOIN organizations organization ON organization.id = membership.organization_id
     WHERE membership.user_id = $1
       AND membership.status = 'active'
       AND organization.status = 'active'
       AND ($2::uuid IS NULL OR organization.id = $2::uuid)
     ORDER BY (organization.id = $3::uuid) DESC, organization.created_at, organization.id
     LIMIT 1`,
    [userId, organizationId, LEGACY_ORGANIZATION_ID],
  );
  return result.rows[0] ?? null;
}

export async function selectedOrganizationForSession(
  request: Request,
  dependencies = productionDependencies,
): Promise<{ user: RailwaySessionUser; organization: SelectedOrganization }> {
  const user = await permanentUser(request, dependencies);
  const selected = cookieValue(request, ORGANIZATION_COOKIE);
  if (selected && !UUID.test(selected)) fail(403, "SELECTED_ORGANIZATION_FORBIDDEN");
  const organization = await membership(user.id, selected, dependencies);
  if (!organization) fail(403, "SELECTED_ORGANIZATION_FORBIDDEN");
  return { user, organization };
}

export async function selectOrganizationForSession(
  request: Request,
  organizationId: unknown,
  dependencies = productionDependencies,
) {
  if (typeof organizationId !== "string" || !UUID.test(organizationId)) {
    fail(400, "ORGANIZATION_ID_INVALID");
  }
  const user = await permanentUser(request, dependencies);
  const organization = await membership(user.id, organizationId, dependencies);
  if (!organization) fail(403, "SELECTED_ORGANIZATION_FORBIDDEN");
  return { user, organization, cookie: selectedOrganizationCookie(organization.id) };
}

export async function requireSelectedOrganizationRole(
  request: Request,
  allowedRoles: readonly OrganizationRole[] = ["owner", "admin"],
  dependencies = productionDependencies,
) {
  const context = await selectedOrganizationForSession(request, dependencies);
  if (!allowedRoles.includes(context.organization.role)) fail(403, "FORBIDDEN");
  return context;
}

export async function requireSelectedTournament(
  request: Request,
  tournamentId: string,
  allowedRoles: readonly OrganizationRole[] = ["owner", "admin"],
  dependencies = productionDependencies,
) {
  if (!UUID.test(tournamentId)) fail(400, "TOURNAMENT_ID_INVALID");
  const context = await requireSelectedOrganizationRole(request, allowedRoles, dependencies);
  const result = await dependencies.query<{ organizationId: string }>(
    `SELECT organization_id AS "organizationId"
     FROM tournaments WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [tournamentId, context.organization.id],
  );
  if (!result.rows[0]) fail(404, "TOURNAMENT_NOT_FOUND");
  return context;
}
