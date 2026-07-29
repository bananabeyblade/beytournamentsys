ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;