REVOKE ALL ON FUNCTION public.has_admin_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_admin_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_admin_role(uuid, public.app_role) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_role(uuid, public.app_role) TO service_role;