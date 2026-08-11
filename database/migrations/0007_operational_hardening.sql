CREATE TABLE IF NOT EXISTS request_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  PRIMARY KEY (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS request_rate_limits_reset_at_idx
  ON request_rate_limits (reset_at);
