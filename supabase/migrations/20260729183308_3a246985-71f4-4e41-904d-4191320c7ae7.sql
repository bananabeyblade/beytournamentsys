CREATE POLICY "Only superadmins can delete tournaments"
ON public.tournaments FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.admin_roles ar WHERE ar.user_id = auth.uid() AND ar.role = 'superadmin'::app_role));

GRANT DELETE ON public.tournaments TO authenticated;