import type { PoolClient, QueryResultRow } from "pg";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";
import { requireSelectedOrganizationRole } from "./selected-organization.server";
import type { RailwaySessionUser } from "./railway-auth.server";
import type { SelectedOrganization } from "./selected-organization.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class OrganizationInvitationError extends Error {
  constructor(
    public readonly status: number,
    code: string,
  ) {
    super(code);
  }
}

export interface OrganizationInvitationSummary {
  id: string;
  email: string;
  role: "admin";
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

type Query = <Row extends QueryResultRow>(
  text: string,
  values?: readonly unknown[],
) => Promise<{ rows: Row[] }>;

export interface OrganizationInvitationDependencies {
  requireOwner: (
    request: Request,
  ) => Promise<{ user: RailwaySessionUser; organization: SelectedOrganization }>;
  query: Query;
  transaction: <T>(work: (client: Pick<PoolClient, "query">) => Promise<T>) => Promise<T>;
}

const productionDependencies: OrganizationInvitationDependencies = {
  requireOwner: (request) => requireSelectedOrganizationRole(request, ["owner"]),
  query: queryPostgres,
  transaction: withPostgresTransaction,
};

function fail(status: number, code: string): never {
  throw new OrganizationInvitationError(status, code);
}

function normalizedEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length < 3 || email.length > 320 || !EMAIL.test(email)) {
    fail(400, "INVITATION_EMAIL_INVALID");
  }
  return email;
}

function invitationId(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) fail(400, "INVITATION_ID_INVALID");
  return value;
}

const invitationColumns = `
  invitation.id,
  invitation.email,
  invitation.role::text AS role,
  CASE
    WHEN invitation.revoked_at IS NOT NULL THEN 'revoked'
    WHEN invitation.accepted_at IS NOT NULL THEN 'accepted'
    WHEN invitation.expires_at <= now() THEN 'expired'
    ELSE 'pending'
  END AS status,
  invitation.created_at AS "createdAt",
  invitation.expires_at AS "expiresAt",
  invitation.accepted_at AS "acceptedAt"`;

export async function listSelectedOrganizationInvitations(
  request: Request,
  dependencies = productionDependencies,
) {
  const { organization } = await dependencies.requireOwner(request);
  const result = await dependencies.query<OrganizationInvitationSummary>(
    `SELECT ${invitationColumns}
     FROM organization_invitations invitation
     WHERE invitation.organization_id = $1
     ORDER BY invitation.created_at DESC
     LIMIT 100`,
    [organization.id],
  );
  return result.rows;
}

export async function inviteGoogleOrganizationAdmin(
  request: Request,
  body: Record<string, unknown>,
  dependencies = productionDependencies,
) {
  const { user, organization } = await dependencies.requireOwner(request);
  const email = normalizedEmail(body.email);
  if (email === user.email.trim().toLowerCase()) fail(409, "INVITATION_SELF");

  return dependencies.transaction(async (client) => {
    const member = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM app_users account
         JOIN organization_memberships membership ON membership.user_id = account.id
         WHERE membership.organization_id = $1
           AND membership.status = 'active'
           AND lower(account.email) = $2
       ) AS exists`,
      [organization.id, email],
    );
    if (member.rows[0]?.exists) fail(409, "INVITATION_MEMBER_EXISTS");

    const invited = await client.query<OrganizationInvitationSummary>(
      `INSERT INTO organization_invitations
         (organization_id, email, role, invited_by, expires_at)
       VALUES ($1, $2, 'admin', $3, now() + interval '7 days')
       ON CONFLICT (organization_id, email) DO UPDATE SET
         role = 'admin'::organization_member_role,
         invited_by = EXCLUDED.invited_by,
         created_at = now(),
         updated_at = now(),
         expires_at = now() + interval '7 days',
         accepted_by = NULL,
         accepted_at = NULL,
         revoked_at = NULL
       RETURNING id, email, role::text AS role, 'pending'::text AS status,
         created_at AS "createdAt", expires_at AS "expiresAt", accepted_at AS "acceptedAt"`,
      [organization.id, email, user.id],
    );
    const invitation = invited.rows[0];
    if (!invitation) throw new Error("INVITATION_INSERT_FAILED");

    await client.query(
      `INSERT INTO admin_actions
         (actor_user_id, actor_email, action, detail, organization_id)
       VALUES ($1, $2, 'organization_invitation_create', $3::jsonb, $4)`,
      [
        user.id,
        user.email,
        JSON.stringify({ invitationId: invitation.id, email }),
        organization.id,
      ],
    );
    return invitation;
  });
}

export async function revokeSelectedOrganizationInvitation(
  request: Request,
  body: Record<string, unknown>,
  dependencies = productionDependencies,
) {
  const { user, organization } = await dependencies.requireOwner(request);
  const id = invitationId(body.invitationId);

  return dependencies.transaction(async (client) => {
    const revoked = await client.query<{ id: string; email: string }>(
      `UPDATE organization_invitations
       SET revoked_at = now(), updated_at = now()
       WHERE id = $1 AND organization_id = $2
         AND accepted_at IS NULL AND revoked_at IS NULL
       RETURNING id, email`,
      [id, organization.id],
    );
    const invitation = revoked.rows[0];
    if (!invitation) fail(404, "INVITATION_NOT_FOUND");

    await client.query(
      `INSERT INTO admin_actions
         (actor_user_id, actor_email, action, detail, organization_id)
       VALUES ($1, $2, 'organization_invitation_revoke', $3::jsonb, $4)`,
      [
        user.id,
        user.email,
        JSON.stringify({ invitationId: invitation.id, email: invitation.email }),
        organization.id,
      ],
    );
    return { ok: true };
  });
}
