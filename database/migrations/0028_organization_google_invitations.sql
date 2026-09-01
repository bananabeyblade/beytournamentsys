-- Google-email invitations are tenant-scoped and become memberships only
-- after Google verifies the exact normalized email during OAuth login.
CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (
    email = lower(btrim(email))
    AND char_length(email) BETWEEN 3 AND 320
  ),
  role organization_member_role NOT NULL DEFAULT 'admin',
  invited_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT organization_invitations_admin_only CHECK (role = 'admin'),
  UNIQUE (organization_id, email)
);

CREATE INDEX IF NOT EXISTS organization_invitations_email_pending_idx
  ON organization_invitations (email, expires_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS organization_invitations_organization_created_idx
  ON organization_invitations (organization_id, created_at DESC);

REVOKE ALL ON TABLE organization_invitations FROM PUBLIC;

COMMENT ON TABLE organization_invitations IS
  'Tenant-scoped allowlist invitations claimed only by a server-verified Google email.';
