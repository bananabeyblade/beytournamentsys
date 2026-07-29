
REVOKE ALL ON FUNCTION public.has_admin_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_any_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_any_admin(uuid) TO authenticated, service_role;
