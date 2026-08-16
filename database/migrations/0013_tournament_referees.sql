CREATE TABLE IF NOT EXISTS tournament_referee_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL UNIQUE REFERENCES tournaments(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  quota integer NOT NULL DEFAULT 3 CHECK (quota BETWEEN 1 AND 32),
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tournament_referees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  invite_id uuid NOT NULL REFERENCES tournament_referee_invites(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  session_token_hash text NOT NULL UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  last_seen_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_referees_active_name_idx
  ON tournament_referees (tournament_id, lower(btrim(display_name)))
  WHERE status IN ('pending', 'approved');

CREATE INDEX IF NOT EXISTS tournament_referees_tournament_status_idx
  ON tournament_referees (tournament_id, status, requested_at);

-- Referee actions are intentionally attributed by display name. Referees are
-- event-scoped identities, not permanent app_users, so their audit rows do not
-- have an app_users foreign-key target.
ALTER TABLE admin_actions ALTER COLUMN actor_user_id DROP NOT NULL;

COMMENT ON TABLE tournament_referee_invites IS
  'Single-event referee QR invitations. Only a hash of the QR secret is stored.';
COMMENT ON TABLE tournament_referees IS
  'Pending/approved referee claims scoped to exactly one tournament.';
