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
  _merged_matches jsonb;
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

  _merged := jsonb_build_object(
    'players', COALESCE(_state->'players', '[]'::jsonb),
    'matches', _merged_matches,
    'tableCount', COALESCE(_state->'tableCount', to_jsonb(2))
  );

  UPDATE public.tournaments
  SET live_state = _merged,
      live_updated_at = COALESCE(_stamp, now())
  WHERE id = _tournament_id
    AND (live_state IS DISTINCT FROM _merged);
END;
$$;

REVOKE ALL ON FUNCTION public.publish_live_state(uuid, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_live_state(uuid, jsonb, timestamptz) TO authenticated, service_role;