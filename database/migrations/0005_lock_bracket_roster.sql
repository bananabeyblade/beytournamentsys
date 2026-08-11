CREATE OR REPLACE FUNCTION guard_railway_bracket_roster()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_match_count integer := CASE
    WHEN jsonb_typeof(OLD.live_state->'matches') = 'array'
      THEN jsonb_array_length(OLD.live_state->'matches')
    ELSE 0
  END;
  new_match_count integer := CASE
    WHEN jsonb_typeof(NEW.live_state->'matches') = 'array'
      THEN jsonb_array_length(NEW.live_state->'matches')
    ELSE 0
  END;
BEGIN
  -- On the first bracket publish, every roster member must appear in at least
  -- one scheduled card. This closes the race
  -- where another referee adds player 17 while a stale device generates 16.
  IF old_match_count = 0 AND new_match_count > 0 AND EXISTS (
    WITH roster AS (
      SELECT player->>'id' AS id
      FROM jsonb_array_elements(COALESCE(NEW.live_state->'players', '[]'::jsonb)) AS p(player)
      WHERE COALESCE(player->>'id', '') <> ''
    ), scheduled AS (
      SELECT match->>'p1' AS id
      FROM jsonb_array_elements(COALESCE(NEW.live_state->'matches', '[]'::jsonb)) AS m(match)
      WHERE COALESCE(match->>'p1', '') <> ''
      UNION
      SELECT match->>'p2' AS id
      FROM jsonb_array_elements(COALESCE(NEW.live_state->'matches', '[]'::jsonb)) AS m(match)
      WHERE COALESCE(match->>'p2', '') <> ''
    )
    SELECT id FROM roster
    EXCEPT
    SELECT id FROM scheduled
  ) THEN
    RAISE EXCEPTION 'bracket does not include every roster player';
  END IF;

  -- A deliberate reset writes an empty bracket and may clear the roster.
  -- Every non-empty bracket keeps the roster it was generated from.
  IF old_match_count > 0
     AND new_match_count > 0
     AND COALESCE(OLD.live_state->'players', '[]'::jsonb)
         IS DISTINCT FROM COALESCE(NEW.live_state->'players', '[]'::jsonb) THEN
    RAISE EXCEPTION 'roster is locked after bracket generation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_railway_roster_after_bracket ON tournaments;
CREATE TRIGGER lock_railway_roster_after_bracket
BEFORE UPDATE OF live_state ON tournaments
FOR EACH ROW
EXECUTE FUNCTION guard_railway_bracket_roster();
