CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  results jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT tournaments_status_check CHECK (status IN ('open','finished')),
  CONSTRAINT tournaments_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT tournaments_code_check CHECK (char_length(code) BETWEEN 4 AND 24)
);

GRANT SELECT (id, code, name, status, results, created_at, finished_at) ON public.tournaments TO anon;
GRANT SELECT (id, code, name, status, results, created_at, finished_at), INSERT, UPDATE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tournaments"
  ON public.tournaments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can create tournaments"
  ON public.tournaments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_any_admin(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Admins can update tournaments"
  ON public.tournaments FOR UPDATE
  TO authenticated
  USING (public.is_any_admin(auth.uid()))
  WITH CHECK (public.is_any_admin(auth.uid()));

ALTER TABLE public.registrations
  ADD COLUMN tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX registrations_unique_name_per_tournament
  ON public.registrations (tournament_id, lower(btrim(name)));

DROP POLICY IF EXISTS "Anyone can submit a registration" ON public.registrations;

CREATE POLICY "Anyone can submit a registration to an open tournament"
  ON public.registrations FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(btrim(name)) >= 1
    AND char_length(btrim(name)) <= 40
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = registrations.tournament_id AND t.status = 'open'
    )
  );

CREATE OR REPLACE FUNCTION public.registration_name_taken(_tournament uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.tournament_id = _tournament
      AND lower(btrim(r.name)) = lower(btrim(_name))
  )
$$;

REVOKE ALL ON FUNCTION public.registration_name_taken(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_name_taken(uuid, text) TO anon, authenticated, service_role;