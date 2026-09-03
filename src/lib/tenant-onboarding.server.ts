import type { PoolClient } from "pg";
import { isOwnerEmail } from "./account-id";

export const LEGACY_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Grant the fixed platform owner its initial tenant authority only after a
 * verified Google identity has been exchanged by the server. This makes a
 * fresh database safe to bootstrap without accepting an email or tenant id
 * from the browser as proof of access.
 */
export async function ensureLegacyOwnerForVerifiedGoogleUser(
  client: Pick<PoolClient, "query">,
  user: { id: string; email: string; googleSubject: string | null },
) {
  if (!user.googleSubject || !isOwnerEmail(user.email)) return false;

  await client.query(
    `INSERT INTO admin_roles (user_id, email, role)
     VALUES ($1, $2, 'superadmin'::app_role)
     ON CONFLICT (user_id, role) DO UPDATE SET email = EXCLUDED.email`,
    [user.id, user.email],
  );
  await client.query(
    `UPDATE organizations
     SET created_by = COALESCE(created_by, $1), updated_at = now()
     WHERE id = $2`,
    [user.id, LEGACY_ORGANIZATION_ID],
  );
  await client.query(
    `INSERT INTO organization_memberships
       (organization_id, user_id, role, status, created_by)
     VALUES ($1, $2, 'owner'::organization_member_role,
       'active'::organization_member_status, $2)
     ON CONFLICT (organization_id, user_id) DO UPDATE
     SET role = 'owner'::organization_member_role,
         status = 'active'::organization_member_status,
         updated_at = now()`,
    [LEGACY_ORGANIZATION_ID, user.id],
  );
  await client.query(
    `INSERT INTO platform_roles (user_id, role)
     VALUES ($1, 'developer'::platform_role)
     ON CONFLICT (user_id, role) DO NOTHING`,
    [user.id],
  );
  return true;
}
