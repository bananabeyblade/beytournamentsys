import type { PoolClient, QueryResultRow } from "pg";
import { queryPostgres, withPostgresTransaction } from "../integrations/postgres/client.server";
import { readRailwaySession, type RailwaySessionUser } from "./railway-auth.server";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export class OrganizationManagementError extends Error {
  constructor(
    public readonly status: number,
    code: string,
  ) {
    super(code);
  }
}

export interface OrganizationSummary {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
  role: "owner" | "admin";
}

type Query = <Row extends QueryResultRow>(
  text: string,
  values?: readonly unknown[],
) => Promise<{ rows: Row[] }>;

export interface OrganizationManagementDependencies {
  readSession: (request: Request) => Promise<RailwaySessionUser | null>;
  query: Query;
  transaction: <T>(work: (client: Pick<PoolClient, "query">) => Promise<T>) => Promise<T>;
}

const productionDependencies: OrganizationManagementDependencies = {
  readSession: readRailwaySession,
  query: queryPostgres,
  transaction: withPostgresTransaction,
};

function fail(status: number, code: string): never {
  throw new OrganizationManagementError(status, code);
}

async function signedInPermanentUser(
  request: Request,
  dependencies: OrganizationManagementDependencies,
) {
  const user = await dependencies.readSession(request);
  if (!user) fail(401, "AUTH_REQUIRED");
  if (user.role === "referee") fail(403, "FORBIDDEN");
  return user;
}

export async function listOrganizationsForSession(
  request: Request,
  dependencies = productionDependencies,
): Promise<OrganizationSummary[]> {
  const user = await signedInPermanentUser(request, dependencies);
  const result = await dependencies.query<OrganizationSummary>(
    `SELECT organization.id, organization.slug, organization.name,
            organization.status, membership.role::text AS role
     FROM organization_memberships membership
     JOIN organizations organization ON organization.id = membership.organization_id
     WHERE membership.user_id = $1
       AND membership.status = 'active'
       AND organization.status <> 'archived'
     ORDER BY organization.name, organization.id`,
    [user.id],
  );
  return result.rows;
}

function organizationInput(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  if (name.length < 1 || name.length > 80) fail(400, "ORGANIZATION_NAME_INVALID");
  if (!SLUG.test(slug)) fail(400, "ORGANIZATION_SLUG_INVALID");
  return { name, slug };
}

export async function createOrganizationForVerifiedGoogleUser(
  request: Request,
  body: Record<string, unknown>,
  dependencies = productionDependencies,
): Promise<OrganizationSummary> {
  const user = await signedInPermanentUser(request, dependencies);
  if (!user.isGoogle) fail(403, "GOOGLE_ACCOUNT_REQUIRED");
  const input = organizationInput(body);

  try {
    return await dependencies.transaction(async (client) => {
      const existing = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM organization_memberships
         WHERE user_id = $1 AND role = 'owner' AND status = 'active'`,
        [user.id],
      );
      if (!user.isDeveloper && Number(existing.rows[0]?.count ?? 0) > 0) {
        fail(409, "ORGANIZATION_LIMIT_REACHED");
      }

      const inserted = await client.query<{
        id: string;
        slug: string;
        name: string;
        status: "active";
      }>(
        `INSERT INTO organizations (slug, name, status, created_by)
         VALUES ($1, $2, 'active', $3)
         RETURNING id, slug, name, status`,
        [input.slug, input.name, user.id],
      );
      const organization = inserted.rows[0];
      if (!organization) throw new Error("ORGANIZATION_INSERT_FAILED");

      await client.query(
        `INSERT INTO admin_roles (user_id, email, role)
         VALUES ($1, $2, 'superadmin'::app_role)
         ON CONFLICT (user_id, role) DO UPDATE SET email = EXCLUDED.email`,
        [user.id, user.email],
      );
      await client.query(
        `INSERT INTO organization_memberships
           (organization_id, user_id, role, status, created_by)
         VALUES ($1, $2, 'owner', 'active', $2)`,
        [organization.id, user.id],
      );
      await client.query(
        `INSERT INTO organization_feature_flags (organization_id, key, enabled, updated_by_email)
         VALUES ($1, 'deck_registration', false, $2)`,
        [organization.id, user.email],
      );
      await client.query(
        `INSERT INTO organization_deck_statistics_state (organization_id, updated_by_user_id, updated_by_email)
         VALUES ($1, $2, $3)`,
        [organization.id, user.id, user.email],
      );
      return { ...organization, role: "owner" as const };
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code === "23505") fail(409, "ORGANIZATION_SLUG_EXISTS");
    throw error;
  }
}
