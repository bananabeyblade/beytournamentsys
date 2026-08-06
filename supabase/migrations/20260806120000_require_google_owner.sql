-- The owner role is re-created by promoteGoogleOwnerFn only after a verified
-- Google OAuth login for john410403123@gmail.com. This retires the legacy
-- password account so it cannot retain superadmin access.
DELETE FROM public.admin_roles
WHERE email = 'john410403123@gmail.com'
  AND role = 'superadmin'::public.app_role;
