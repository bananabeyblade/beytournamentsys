CREATE TABLE IF NOT EXISTS tournament_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  content_type text NOT NULL CHECK (content_type LIKE 'image/%'),
  content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
