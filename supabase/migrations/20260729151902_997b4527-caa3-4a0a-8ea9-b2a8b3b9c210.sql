-- Remove the permissive public DELETE policy on registrations.
-- Deletion is now performed server-side (service role) after an admin passcode check.
DROP POLICY IF EXISTS "Anyone can remove a registration" ON public.registrations;

REVOKE DELETE ON public.registrations FROM anon;
REVOKE DELETE ON public.registrations FROM authenticated;

GRANT ALL ON public.registrations TO service_role;