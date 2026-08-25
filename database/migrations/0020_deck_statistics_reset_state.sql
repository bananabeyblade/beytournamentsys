-- A reset advances the reporting baseline without deleting immutable Deck,
-- tournament, score, or battle records.
CREATE TABLE IF NOT EXISTS deck_statistics_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  reset_at TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

INSERT INTO deck_statistics_state (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;
