-- A player's recovery-code record is the stable identity for their Deck. Names
-- are editable presentation data and must not be used to join tournament data.
ALTER TABLE tournament_deck_snapshots
  ADD COLUMN IF NOT EXISTS recovery_code_id UUID
  REFERENCES participant_recovery_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tournament_deck_snapshots_recovery_code_idx
  ON tournament_deck_snapshots (tournament_id, recovery_code_id);

-- Repair legacy snapshots that were matched by name. The recovery code is
-- unique per tournament/name, so this is a one-time safe identity backfill.
UPDATE tournament_deck_snapshots snapshot
SET recovery_code_id = recovery.id
FROM participant_recovery_codes recovery
WHERE snapshot.recovery_code_id IS NULL
  AND recovery.tournament_id = snapshot.tournament_id
  AND lower(btrim(recovery.name)) = lower(btrim(snapshot.participant_name));

-- A historical empty snapshot is not useful Deck data. Only fill empty
-- snapshots, leaving every already-recorded Deck snapshot immutable.
UPDATE tournament_deck_snapshots snapshot
SET combos = deck.combos
FROM participant_decks deck
WHERE snapshot.recovery_code_id = deck.recovery_code_id
  AND snapshot.tournament_id = deck.tournament_id
  AND jsonb_array_length(COALESCE(snapshot.combos, '[]'::jsonb)) = 0
  AND jsonb_array_length(COALESCE(deck.combos, '[]'::jsonb)) > 0;

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
  ), identities AS (
    SELECT roster.player_id, roster.participant_name, recovery.id AS recovery_code_id
    FROM roster
    LEFT JOIN participant_recovery_codes recovery
      ON recovery.tournament_id = NEW.id
     AND lower(btrim(recovery.name)) = lower(btrim(roster.participant_name))
  )
  INSERT INTO tournament_deck_snapshots
    (tournament_id, player_id, participant_name, recovery_code_id, combos)
  SELECT NEW.id,
         identities.player_id::uuid,
         identities.participant_name,
         identities.recovery_code_id,
         COALESCE(deck.combos, '[]'::jsonb)
  FROM candidate_ids
  JOIN identities USING (player_id)
  LEFT JOIN participant_decks deck
    ON deck.recovery_code_id = identities.recovery_code_id
  WHERE candidate_ids.player_id IS NOT NULL
    AND candidate_ids.player_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ON CONFLICT (tournament_id, player_id) DO UPDATE
    SET recovery_code_id = COALESCE(tournament_deck_snapshots.recovery_code_id, EXCLUDED.recovery_code_id),
        participant_name = EXCLUDED.participant_name,
        combos = CASE
          WHEN jsonb_array_length(COALESCE(tournament_deck_snapshots.combos, '[]'::jsonb)) = 0
            AND jsonb_array_length(COALESCE(EXCLUDED.combos, '[]'::jsonb)) > 0
            THEN EXCLUDED.combos
          ELSE tournament_deck_snapshots.combos
        END
  WHERE tournament_deck_snapshots.recovery_code_id IS NULL
     OR (
       jsonb_array_length(COALESCE(tournament_deck_snapshots.combos, '[]'::jsonb)) = 0
       AND jsonb_array_length(COALESCE(EXCLUDED.combos, '[]'::jsonb)) > 0
     );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_top8_deck_snapshots() FROM PUBLIC;
