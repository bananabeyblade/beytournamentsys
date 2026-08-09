-- `has_admin_role` is intentionally not executable by browser sessions. These
-- SECURITY DEFINER functions therefore check the caller's role directly so a
-- legitimate superadmin reset cannot fail on function permissions.

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
  IF NOT EXISTS (
    SELECT 1
    FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND role = 'superadmin'::public.app_role
  ) THEN
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

CREATE OR REPLACE FUNCTION public.guard_roster_after_bracket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_match_count integer := 0;
  _new_match_count integer := 0;
BEGIN
  IF jsonb_typeof(OLD.live_state->'matches') = 'array' THEN
    _old_match_count := jsonb_array_length(OLD.live_state->'matches');
  END IF;
  IF jsonb_typeof(NEW.live_state->'matches') = 'array' THEN
    _new_match_count := jsonb_array_length(NEW.live_state->'matches');
  END IF;

  IF _old_match_count = 0 THEN
    RETURN NEW;
  END IF;

  IF _new_match_count = 0
     AND NOT EXISTS (
       SELECT 1
       FROM public.admin_roles
       WHERE user_id = auth.uid()
         AND role = 'superadmin'::public.app_role
     ) THEN
    RAISE EXCEPTION 'only a superadmin may reset an existing bracket';
  END IF;

  IF _new_match_count > 0
     AND COALESCE(NEW.live_state->'players', '[]'::jsonb)
         IS DISTINCT FROM COALESCE(OLD.live_state->'players', '[]'::jsonb) THEN
    RAISE EXCEPTION 'roster is locked after bracket generation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_tournament_live_state(uuid, integer, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_tournament_live_state(uuid, integer, timestamptz)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_roster_after_bracket() FROM PUBLIC, anon, authenticated;
