-- Preserve who granted a superadmin role. This is the ownership boundary that
-- later multi-tenant organizations can build on.
ALTER TABLE public.admin_roles
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid
  REFERENCES public.app_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS admin_roles_created_by_user_id_idx
  ON public.admin_roles(created_by_user_id);

-- Before this migration only the platform owner could create superadmins. Link
-- those existing non-owner superadmins to that owner without pretending that
-- the owner created their own role.
UPDATE public.admin_roles AS role_row
SET created_by_user_id = owner.id
FROM public.app_users AS owner
WHERE role_row.role = 'superadmin'
  AND role_row.created_by_user_id IS NULL
  AND owner.email = 'john410403123@gmail.com'
  AND role_row.user_id <> owner.id;

COMMENT ON COLUMN public.admin_roles.created_by_user_id IS
  'The platform user who granted this role; used for owner-managed superadmins.';
