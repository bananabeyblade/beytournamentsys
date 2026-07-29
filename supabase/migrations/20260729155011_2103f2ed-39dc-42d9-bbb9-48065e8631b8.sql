-- is_any_admin no longer needs elevated rights: it only checks the caller's own row
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = _user_id)
$function$;

-- has_admin_role stays SECURITY DEFINER but is no longer reachable by signed-in users
DROP POLICY IF EXISTS "Superadmins can read all roles" ON public.admin_roles;
REVOKE EXECUTE ON FUNCTION public.has_admin_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_role(uuid, public.app_role) TO service_role;