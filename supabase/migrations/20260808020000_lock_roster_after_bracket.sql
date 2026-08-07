-- A bracket refers to player ids stored in live_state. Once it exists, a
-- stale referee page must not add/remove players and leave broken match cards.
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

  -- Clearing a bracket is a deliberate reset and remains superadmin-only.
  IF _new_match_count = 0
     AND NOT public.has_admin_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'only a superadmin may reset an existing bracket';
  END IF;

  -- Match scoring may continue, but its roster is immutable until reset.
  IF _new_match_count > 0
     AND COALESCE(NEW.live_state->'players', '[]'::jsonb)
         IS DISTINCT FROM COALESCE(OLD.live_state->'players', '[]'::jsonb) THEN
    RAISE EXCEPTION 'roster is locked after bracket generation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_roster_after_bracket ON public.tournaments;
CREATE TRIGGER lock_roster_after_bracket
BEFORE UPDATE OF live_state ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.guard_roster_after_bracket();

REVOKE ALL ON FUNCTION public.guard_roster_after_bracket() FROM PUBLIC, anon, authenticated;
