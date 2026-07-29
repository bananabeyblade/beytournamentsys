CREATE TABLE public.registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.registrations TO anon;
GRANT SELECT, INSERT, DELETE ON public.registrations TO authenticated;
GRANT ALL ON public.registrations TO service_role;

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view registrations" ON public.registrations FOR SELECT USING (true);
CREATE POLICY "Anyone can submit a registration" ON public.registrations FOR INSERT WITH CHECK (char_length(btrim(name)) BETWEEN 1 AND 40);
CREATE POLICY "Anyone can remove a registration" ON public.registrations FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations;