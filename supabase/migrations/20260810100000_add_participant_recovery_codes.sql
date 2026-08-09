-- A QR participant can recover their identity after browser storage is lost.
-- The code is intentionally readable only through an admin-authorized server
-- function; public callers may only create or verify their own code.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS recovery_code_prefix text;

UPDATE public.tournaments
SET recovery_code_prefix = lpad(floor(random() * 10000)::integer::text, 4, '0')
WHERE recovery_code_prefix IS NULL;

ALTER TABLE public.tournaments
  ALTER COLUMN recovery_code_prefix SET NOT NULL,
  ALTER COLUMN recovery_code_prefix SET DEFAULT lpad(floor(random() * 10000)::integer::text, 4, '0'),
  ADD CONSTRAINT tournaments_recovery_code_prefix_check
    CHECK (recovery_code_prefix ~ '^[0-9]{4}$');

CREATE TABLE IF NOT EXISTS public.participant_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  recovery_code text NOT NULL CHECK (recovery_code ~ '^[0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS participant_recovery_codes_name_per_tournament
  ON public.participant_recovery_codes (tournament_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS participant_recovery_codes_code_per_tournament
  ON public.participant_recovery_codes (tournament_id, recovery_code);

ALTER TABLE public.participant_recovery_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.participant_recovery_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.participant_recovery_codes TO service_role;

-- Public QR registration is an RPC so the database generates the random
-- suffix atomically and never grants direct reads of other participants.
DROP POLICY IF EXISTS "Anyone can submit a registration to an open tournament" ON public.registrations;
REVOKE INSERT ON public.registrations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_registration_with_recovery_code(
  _tournament_id uuid,
  _name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_name text := btrim(_name);
  _prefix text;
  _code text;
BEGIN
  IF char_length(_clean_name) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'name must be between 1 and 40 characters';
  END IF;

  SELECT recovery_code_prefix
  INTO _prefix
  FROM public.tournaments
  WHERE id = _tournament_id
    AND status = 'open';

  IF _prefix IS NULL THEN
    RAISE EXCEPTION 'open tournament not found';
  END IF;

  -- Existing pending or approved names must reclaim rather than register a
  -- second identity. The unique expression index provides the race-safe guard.
  IF EXISTS (
    SELECT 1 FROM public.participant_recovery_codes
    WHERE tournament_id = _tournament_id
      AND lower(btrim(name)) = lower(_clean_name)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'name already registered';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE tournament_id = _tournament_id
      AND lower(btrim(name)) = lower(_clean_name)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'name already registered';
  END IF;

  LOOP
    _code := _prefix || lpad(floor(random() * 10000)::integer::text, 4, '0');
    INSERT INTO public.participant_recovery_codes (tournament_id, name, recovery_code)
    VALUES (_tournament_id, _clean_name, _code)
    ON CONFLICT (tournament_id, recovery_code) DO NOTHING;
    EXIT WHEN FOUND;
  END LOOP;

  INSERT INTO public.registrations (tournament_id, name)
  VALUES (_tournament_id, _clean_name);

  RETURN _code;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_participant_recovery_code(
  _tournament_id uuid,
  _name text,
  _recovery_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.participant_recovery_codes c
    JOIN public.tournaments t ON t.id = c.tournament_id
    WHERE c.tournament_id = _tournament_id
      AND t.status = 'open'
      AND lower(btrim(c.name)) = lower(btrim(_name))
      AND c.recovery_code = btrim(_recovery_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.registration_name_taken(_tournament uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.participant_recovery_codes c
    WHERE c.tournament_id = _tournament
      AND lower(btrim(c.name)) = lower(btrim(_name))
    UNION ALL
    SELECT 1 FROM public.registrations r
    WHERE r.tournament_id = _tournament
      AND lower(btrim(r.name)) = lower(btrim(_name))
  )
$$;

REVOKE ALL ON FUNCTION public.create_registration_with_recovery_code(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_participant_recovery_code(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registration_name_taken(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_registration_with_recovery_code(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_participant_recovery_code(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registration_name_taken(uuid, text) TO anon, authenticated, service_role;

-- A reset intentionally starts a fresh event and invalidates old recovery
-- codes as well as pending sign-ups.
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
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid() AND role = 'superadmin'::public.app_role
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
  WHERE id = _tournament_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open tournament not found';
  END IF;

  DELETE FROM public.registrations WHERE tournament_id = _tournament_id;
  DELETE FROM public.participant_recovery_codes WHERE tournament_id = _tournament_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_tournament_live_state(uuid, integer, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_tournament_live_state(uuid, integer, timestamptz)
  TO authenticated, service_role;
