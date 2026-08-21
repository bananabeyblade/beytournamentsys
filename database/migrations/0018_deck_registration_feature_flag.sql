CREATE TABLE IF NOT EXISTS app_feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

INSERT INTO app_feature_flags (key, enabled)
VALUES ('deck_registration', TRUE)
ON CONFLICT (key) DO NOTHING;
