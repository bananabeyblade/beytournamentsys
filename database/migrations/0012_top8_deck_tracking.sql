CREATE TABLE IF NOT EXISTS tournament_deck_snapshots (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  participant_name TEXT NOT NULL,
  combos JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(combos) = 'array' AND jsonb_array_length(combos) BETWEEN 0 AND 3),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, player_id)
);

CREATE INDEX IF NOT EXISTS tournament_deck_snapshots_tournament_idx
  ON tournament_deck_snapshots (tournament_id, captured_at);

-- Capture each qualifier exactly once when their slot in the last-eight round
-- becomes known.  The immutable snapshot keeps historical reports stable even
-- if the parts catalogue changes later.
CREATE OR REPLACE FUNCTION public.capture_top8_deck_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _max_round integer;
  _top8_round integer;
BEGIN
  -- Once the complete last-eight field has been captured, scoring updates can
  -- skip the JSON scan entirely. This keeps the trigger effectively free for
  -- the rest of a large tournament.
  IF (SELECT count(*) FROM tournament_deck_snapshots WHERE tournament_id = NEW.id) >= 8 THEN
    RETURN NEW;
  END IF;

  IF NEW.live_state IS NULL
     OR jsonb_typeof(NEW.live_state->'matches') IS DISTINCT FROM 'array'
     OR jsonb_array_length(COALESCE(NEW.live_state->'matches', '[]'::jsonb)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT max((m.match->>'round')::integer)
    INTO _max_round
  FROM jsonb_array_elements(COALESCE(NEW.live_state->'matches', '[]'::jsonb)) AS m(match)
  WHERE COALESCE(m.match->>'kind', 'main') = 'main'
    AND (m.match->>'round') ~ '^[0-9]+$';

  IF _max_round IS NULL THEN RETURN NEW; END IF;
  _top8_round := GREATEST(0, _max_round - 2);

  WITH target_matches AS (
    SELECT m.match
    FROM jsonb_array_elements(COALESCE(NEW.live_state->'matches', '[]'::jsonb)) AS m(match)
    WHERE COALESCE(m.match->>'kind', 'main') = 'main'
      AND (m.match->>'round')::integer = _top8_round
  ), candidate_ids AS (
    SELECT match->>'p1' AS player_id FROM target_matches
    UNION
    SELECT match->>'p2' AS player_id FROM target_matches
  ), roster AS (
    SELECT p.player->>'id' AS player_id, p.player->>'name' AS participant_name
    FROM jsonb_array_elements(COALESCE(NEW.live_state->'players', '[]'::jsonb)) AS p(player)
  )
  INSERT INTO tournament_deck_snapshots
    (tournament_id, player_id, participant_name, combos)
  SELECT NEW.id,
         roster.player_id::uuid,
         roster.participant_name,
         COALESCE(deck.combos, '[]'::jsonb)
  FROM candidate_ids
  JOIN roster USING (player_id)
  LEFT JOIN participant_decks deck
    ON deck.tournament_id = NEW.id
   AND lower(btrim(deck.participant_name)) = lower(btrim(roster.participant_name))
  WHERE candidate_ids.player_id IS NOT NULL
    AND candidate_ids.player_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ON CONFLICT (tournament_id, player_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capture_top8_decks_after_live_update ON tournaments;
CREATE TRIGGER capture_top8_decks_after_live_update
AFTER INSERT OR UPDATE OF live_state ON tournaments
FOR EACH ROW EXECUTE FUNCTION public.capture_top8_deck_snapshots();

REVOKE ALL ON FUNCTION public.capture_top8_deck_snapshots() FROM PUBLIC;
