import type { PoolClient } from "pg";

type Invitation = {
  id: string;
  organization_id: string;
};

export async function claimOrganizationInvitationsForVerifiedGoogleUser(
  client: Pick<PoolClient, "query">,
  user: { id: string; email: string; googleSubject: string | null },
): Promise<string[]> {
  if (!user.googleSubject) return [];
  const email = user.email.trim().toLowerCase();
  const invitations = await client.query<Invitation>(
    `SELECT invitation.id, invitation.organization_id
     FROM organization_invitations invitation
     JOIN organizations organization ON organization.id = invitation.organization_id
     WHERE invitation.email = $1
       AND invitation.accepted_at IS NULL
       AND invitation.revoked_at IS NULL
       AND invitation.expires_at > now()
       AND organization.status = 'active'
     ORDER BY invitation.created_at
     FOR UPDATE OF invitation`,
    [email],
  );

  for (const invitation of invitations.rows) {
    await client.query(
      `INSERT INTO organization_memberships
         (organization_id, user_id, role, status, created_by)
       SELECT organization_id, $2, role, 'active', invited_by
       FROM organization_invitations WHERE id = $1
       ON CONFLICT (organization_id, user_id) DO UPDATE SET
         role = CASE
           WHEN organization_memberships.role = 'owner' THEN 'owner'::organization_member_role
           ELSE EXCLUDED.role
         END,
         status = 'active'::organization_member_status,
         updated_at = now()`,
      [invitation.id, user.id],
    );
    await client.query(
      `UPDATE organization_invitations
       SET accepted_by = $2, accepted_at = now(), updated_at = now()
       WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [invitation.id, user.id],
    );
    await client.query(
      `INSERT INTO admin_actions
         (actor_user_id, actor_email, action, detail, organization_id)
       VALUES ($1, $2, 'organization_invitation_accept', $3::jsonb, $4)`,
      [user.id, email, JSON.stringify({ invitationId: invitation.id }), invitation.organization_id],
    );
  }

  return invitations.rows.map((invitation) => invitation.organization_id);
}
