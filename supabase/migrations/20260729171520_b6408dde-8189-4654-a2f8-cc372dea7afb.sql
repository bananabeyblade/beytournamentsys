DROP POLICY IF EXISTS "Only superadmins can create tournaments" ON public.tournaments;
CREATE POLICY "Only superadmins can create tournaments"
ON public.tournaments FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid() AND ar.role = 'superadmin'::app_role
  )
);
GRANT SELECT, INSERT, UPDATE ON public.tournaments TO authenticated;
GRANT SELECT ON public.tournaments TO anon;
GRANT ALL ON public.tournaments TO service_role;