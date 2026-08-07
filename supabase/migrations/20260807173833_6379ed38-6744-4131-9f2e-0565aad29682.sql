CREATE OR REPLACE FUNCTION public.reset_tournament_live_state(_tournament_id uuid, _table_count integer, _stamp timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid() AND ar.role = 'superadmin'::public.app_role
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
$function$;