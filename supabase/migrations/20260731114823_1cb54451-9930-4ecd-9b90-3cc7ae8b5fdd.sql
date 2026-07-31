CREATE OR REPLACE FUNCTION public.publish_live_state(_tournament_id uuid, _state jsonb, _stamp timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _current jsonb;
  _merged_matches jsonb;
  _merged_players jsonb;
  _removed jsonb;
  _merged jsonb;
BEGIN
  SELECT live_state INTO _current FROM public.tournaments WHERE id = _tournament_id;

  IF _current IS NULL
     OR jsonb_typeof(_current->'matches') <> 'array'
     OR jsonb_array_length(COALESCE(_state->'matches', '[]'::jsonb)) = 0 THEN
    _merged_matches := COALESCE(_state->'matches', '[]'::jsonb);
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
    FROM jsonb_array_elements(_state->'matches') WITH ORDINALITY AS n(new_m, ord)
    LEFT JOIN LATERAL (
      SELECT o AS old_m
      FROM jsonb_array_elements(_current->'matches') AS c(o)
      WHERE o->>'id' = n.new_m->>'id'
      LIMIT 1
    ) prev ON true;
  END IF;

  -- Tombstones sent along with the snapshot: ids removed on the publishing device.
  _removed := CASE
    WHEN jsonb_typeof(_state->'removedPlayers') = 'array' THEN _state->'removedPlayers'
    ELSE '[]'::jsonb
  END;

  -- Roster merge by player id: incoming order wins, rows only in the stored
  -- snapshot are appended, and tombstoned ids are dropped. Prevents two admins
  -- adding players at the same time from wiping each other's entries.
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

  -- Re-number seeds to match final roster order.
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
    AND (live_state IS DISTINCT FROM _merged);
END;
$function$;