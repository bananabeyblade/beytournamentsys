DROP POLICY IF EXISTS "Admins can create tournaments" ON public.tournaments;
CREATE POLICY "Only superadmins can create tournaments"
ON public.tournaments FOR INSERT TO authenticated
WITH CHECK (public.has_admin_role(auth.uid(), 'superadmin'::app_role) AND created_by = auth.uid());