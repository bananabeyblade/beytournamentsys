CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Authentication moves from Supabase Auth to the application service. Password
-- hashes and OAuth identities never leave the Railway backend.
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  google_subject text UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  email text,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 4 AND 24),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finished')),
  results jsonb,
  live_state jsonb,
  live_updated_at timestamptz,
  logo_url text,
  recovery_code_prefix text NOT NULL DEFAULT lpad(floor(random() * 10000)::integer::text, 4, '0')
    CHECK (recovery_code_prefix ~ '^[0-9]{4}$'),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS registrations_unique_name_per_tournament
  ON registrations (tournament_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS participant_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  recovery_code text NOT NULL CHECK (recovery_code ~ '^[0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS participant_recovery_codes_name_per_tournament
  ON participant_recovery_codes (tournament_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS participant_recovery_codes_code_per_tournament
  ON participant_recovery_codes (tournament_id, recovery_code);

CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  actor_email text,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
  tournament_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx ON admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_tournament_id_idx ON admin_actions (tournament_id);
