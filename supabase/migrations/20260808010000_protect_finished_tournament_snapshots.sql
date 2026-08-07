-- A referee device may still believe an event is open for a short time after
-- another device archives it.  Never let that stale client overwrite the
-- final bracket, and never treat an empty match list as an ordinary sync once
-- a bracket exists.
CREATE OR REPLACE FUNCTION public.publish_live_state(
  _tournament_id uuid,
  _state jsonb,
  _stamp timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _current jsonb;
  _status text;
  _incoming_matches jsonb;
  _merged_matches jsonb;
  _merged_players jsonb;
  _removed jsonb;
  _merged jsonb;
BEGIN
  SELECT live_state, status
    INTO _current, _status
  FROM public.tournaments
  WHERE id = _tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found';
  END IF;

  IF _status <> 'open' THEN
    RAISE EXCEPTION 'finished tournament snapshots are immutable';
  END IF;

  _incoming_matches := CASE
    WHEN jsonb_typeof(_state->'matches') = 'array' THEN _state->'matches'
    ELSE '[]'::jsonb
  END;

  IF _current IS NOT NULL
     AND jsonb_typeof(_current->'matches') = 'array'
     AND jsonb_array_length(_current->'matches') > 0
     AND jsonb_array_length(_incoming_matches) = 0 THEN
    RAISE EXCEPTION 'empty snapshot cannot replace an existing bracket';
  END IF;

  IF _current IS NULL
     OR jsonb_typeof(_current->'matches') <> 'array'
     OR jsonb_array_length(_incoming_matches) = 0 THEN
    _merged_matches := _incoming_matches;
  ELSE
    SELECT COALESCE(jsonb_agg(
             CASE
               WHEN old_m IS NOT NULL
                AND (
                  COALESCE((old_m->>'rev')::numeric, 0) > COALESCE((new_m->>'rev')::numeric, 0)
                  OR (
                    COALESCE((old_m->>'rev')::numeric, 0) = COALESCE((new_m->>'rev')::numeric, 0)
                    AND COALESCE((old_m->>'updatedAt')::numeric, 0) > COALESCE((new_m->>'updatedAt')::numeric, 0)
                  )
                )
               THEN old_m ELSE new_m
             END
             ORDER BY ord
           ), '[]'::jsonb)
      INTO _merged_matches
    FROM jsonb_array_elements(_incoming_matches) WITH ORDINALITY AS n(new_m, ord)
    LEFT JOIN LATERAL (
      SELECT o AS old_m
      FROM jsonb_array_elements(_current->'matches') AS c(o)
      WHERE o->>'id' = n.new_m->>'id'
      LIMIT 1
    ) prev ON true;
  END IF;

  _removed := CASE
    WHEN jsonb_typeof(_state->'removedPlayers') = 'array' THEN _state->'removedPlayers'
    ELSE '[]'::jsonb
  END;

  IF _current IS NULL OR jsonb_typeof(_current->'players') <> 'array' THEN
    SELECT COALESCE(jsonb_agg(p ORDER BY ord), '[]'::jsonb)
      INTO _merged_players
    FROM jsonb_array_elements(COALESCE(_state->'players', '[]'::jsonb)) WITH ORDINALITY AS t(p, ord)
    WHERE NOT (_removed ? (p->>'id'));
  ELSE
    WITH incoming AS (
      SELECT p, ord FROM jsonb_array_elements(COALESCE(_state->'players', '[]'::jsonb))
        WITH ORDINALITY AS t(p, ord)
    ),
    stored AS (
      SELECT p, ord FROM jsonb_array_elements(_current->'players') WITH ORDINALITY AS t(p, ord)
    ),
    unioned AS (
      SELECT p, ord, 0 AS src FROM incoming
      UNION ALL
      SELECT s.p, s.ord, 1 AS src
      FROM stored s
      WHERE NOT EXISTS (SELECT 1 FROM incoming i WHERE i.p->>'id' = s.p->>'id')
    )
    SELECT COALESCE(jsonb_agg(p ORDER BY src, ord), '[]'::jsonb)
      INTO _merged_players
    FROM unioned
    WHERE NOT (_removed ? (p->>'id'));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_set(p, '{seed}', to_jsonb(ord)) ORDER BY ord), '[]'::jsonb)
    INTO _merged_players
  FROM jsonb_array_elements(_merged_players) WITH ORDINALITY AS t(p, ord);

  _merged := jsonb_build_object(
    'players', _merged_players,
    'matches', _merged_matches,
    'tableCount', COALESCE(_state->'tableCount', to_jsonb(2)),
    'removedPlayers', _removed
  );

  UPDATE public.tournaments
  SET live_state = _merged,
      live_updated_at = COALESCE(_stamp, now())
  WHERE id = _tournament_id
    AND status = 'open'
    AND live_state IS DISTINCT FROM _merged;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_live_state(uuid, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_live_state(uuid, jsonb, timestamptz) TO authenticated, service_role;

-- Clearing an existing bracket is intentionally separate from normal sync and
-- is restricted to a superadmin.  This keeps an empty/stale device from being
-- indistinguishable from a deliberate reset.
CREATE OR REPLACE FUNCTION public.reset_tournament_live_state(
  _tournament_id uuid,
  _table_count integer,
  _stamp timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_admin_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'superadmin required';
  END IF;

  UPDATE public.tournaments
  SET live_state = jsonb_build_object(
        'players', '[]'::jsonb,
        'matches', '[]'::jsonb,
        'tableCount', to_jsonb(GREATEST(1, LEAST(COALESCE(_table_count, 2), 12))),
        'removedPlayers', '[]'::jsonb
      ),
      live_updated_at = COALESCE(_stamp, now())
  WHERE id = _tournament_id
    AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open tournament not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_tournament_live_state(uuid, integer, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_tournament_live_state(uuid, integer, timestamptz)
  TO authenticated, service_role;
