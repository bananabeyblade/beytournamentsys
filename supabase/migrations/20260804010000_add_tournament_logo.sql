-- Feature: per-tournament custom logo, set by the host when creating an event.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Storage bucket for tournament logo images. Public read (the logo shows on
-- the public registration/results pages), write restricted to admins.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tournament-logos', 'tournament-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view tournament logos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'tournament-logos');

CREATE POLICY "Admins can upload tournament logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'tournament-logos' AND public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can replace tournament logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'tournament-logos' AND public.is_any_admin(auth.uid()))
  WITH CHECK (bucket_id = 'tournament-logos' AND public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can delete tournament logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'tournament-logos' AND public.is_any_admin(auth.uid()));
