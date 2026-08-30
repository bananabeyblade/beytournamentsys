-- Add the tenant boundary without changing the current single-organization UI.
-- The stable Legacy id keeps old application builds working during a rolling
-- deployment: inserts that do not yet send organization_id remain scoped to
-- the existing Zhuqian organization instead of creating unowned rows.

DO $$ BEGIN
  CREATE TYPE organization_member_role AS ENUM ('owner', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE organization_member_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE platform_role AS ENUM ('developer', 'support');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  logo_url text,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(branding) = 'object'),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_format CHECK (
    slug = lower(slug)
    AND slug ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique_idx ON organizations (lower(slug));
CREATE INDEX IF NOT EXISTS organizations_status_idx ON organizations (status, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role organization_member_role NOT NULL,
  status organization_member_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_memberships_user_idx
  ON organization_memberships (user_id, status, organization_id);
CREATE INDEX IF NOT EXISTS organization_memberships_organization_idx
  ON organization_memberships (organization_id, status, role);

CREATE TABLE IF NOT EXISTS platform_roles (
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role platform_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

-- Stable id used only for the migration bridge. Future tenant creation must
-- always provide an explicit organization_id from a server-authorized scope.
INSERT INTO organizations (id, slug, name, status, created_by)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  'zhuqian',
  '竹塹陀螺集會所',
  'active',
  (
    SELECT id FROM app_users
    WHERE lower(email) = 'john410403123@gmail.com' AND google_subject IS NOT NULL
    LIMIT 1
  )
ON CONFLICT (id) DO NOTHING;

-- Existing global administrators become members of the Legacy organization.
-- Multiple old roles collapse to the strongest tenant role.
INSERT INTO organization_memberships (organization_id, user_id, role, status)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  roles.user_id,
  CASE WHEN bool_or(roles.role = 'superadmin')
    THEN 'owner'::organization_member_role
    ELSE 'admin'::organization_member_role
  END,
  'active'::organization_member_status
FROM admin_roles roles
GROUP BY roles.user_id
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Ensure the authenticated platform developer also owns the Legacy tenant,
-- even if an earlier installation did not keep a matching admin_roles row.
INSERT INTO organization_memberships (organization_id, user_id, role, status)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  id,
  'owner'::organization_member_role,
  'active'::organization_member_status
FROM app_users
WHERE lower(email) = 'john410403123@gmail.com' AND google_subject IS NOT NULL
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = 'owner'::organization_member_role,
    status = 'active'::organization_member_status,
    updated_at = now();

-- Platform authority is deliberately separate from tenant ownership.
INSERT INTO platform_roles (user_id, role)
SELECT id, 'developer'::platform_role
FROM app_users
WHERE lower(email) = 'john410403123@gmail.com' AND google_subject IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE tournaments
SET organization_id = '00000000-0000-4000-8000-000000000001'::uuid
WHERE organization_id IS NULL;
ALTER TABLE tournaments
  ALTER COLUMN organization_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  ALTER COLUMN organization_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tournaments_organization_id_fkey'
      AND conrelid = 'tournaments'::regclass
  ) THEN
    ALTER TABLE tournaments
      ADD CONSTRAINT tournaments_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
ALTER TABLE tournaments VALIDATE CONSTRAINT tournaments_organization_id_fkey;

CREATE INDEX IF NOT EXISTS tournaments_organization_status_idx
  ON tournaments (organization_id, status, created_at DESC);

ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE admin_actions actions
SET organization_id = COALESCE(
  (SELECT tournament.organization_id FROM tournaments tournament WHERE tournament.id = actions.tournament_id),
  '00000000-0000-4000-8000-000000000001'::uuid
)
WHERE organization_id IS NULL;
ALTER TABLE admin_actions
  ALTER COLUMN organization_id SET DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  ALTER COLUMN organization_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_actions_organization_id_fkey'
      AND conrelid = 'admin_actions'::regclass
  ) THEN
    ALTER TABLE admin_actions
      ADD CONSTRAINT admin_actions_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
ALTER TABLE admin_actions VALIDATE CONSTRAINT admin_actions_organization_id_fkey;

CREATE INDEX IF NOT EXISTS admin_actions_organization_created_idx
  ON admin_actions (organization_id, created_at DESC);

-- Tenant-scoped replacements are populated now, while the existing global
-- tables remain untouched until the API is switched in a later deployment.
CREATE TABLE IF NOT EXISTS organization_feature_flags (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (char_length(btrim(key)) BETWEEN 1 AND 80),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_email text,
  PRIMARY KEY (organization_id, key)
);

INSERT INTO organization_feature_flags
  (organization_id, key, enabled, updated_at, updated_by_email)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  key,
  enabled,
  updated_at,
  updated_by
FROM app_feature_flags
ON CONFLICT (organization_id, key) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization_deck_statistics_state (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  reset_at timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by_email text
);

INSERT INTO organization_deck_statistics_state
  (organization_id, reset_at, updated_at, updated_by_email)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  reset_at,
  updated_at,
  updated_by
FROM deck_statistics_state
WHERE singleton = TRUE
ON CONFLICT (organization_id) DO NOTHING;

-- PostgreSQL does not grant these tables to PUBLIC by default, but explicit
-- revocation documents and preserves the intended backend-only boundary.
REVOKE ALL ON TABLE
  organizations,
  organization_memberships,
  platform_roles,
  organization_feature_flags,
  organization_deck_statistics_state
FROM PUBLIC;

COMMENT ON TABLE organizations IS
  'Tenant boundary. Organization ids must be resolved and authorized by the server.';
COMMENT ON TABLE organization_memberships IS
  'Tenant roles for permanent application users; never trust a client-supplied organization id by itself.';
COMMENT ON TABLE platform_roles IS
  'Platform-wide authority, intentionally separate from organization ownership.';
