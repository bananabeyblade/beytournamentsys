CREATE TABLE IF NOT EXISTS participant_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_code_id UUID NOT NULL UNIQUE
    REFERENCES participant_recovery_codes(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  participant_name TEXT NOT NULL,
  combos JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(combos) = 'array' AND jsonb_array_length(combos) BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS participant_decks_tournament_idx
  ON participant_decks (tournament_id);
CREATE INDEX IF NOT EXISTS participant_decks_participant_name_idx
  ON participant_decks (tournament_id, lower(btrim(participant_name)));
