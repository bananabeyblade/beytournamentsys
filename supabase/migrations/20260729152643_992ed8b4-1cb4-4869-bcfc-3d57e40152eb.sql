
CREATE TYPE public.app_role AS ENUM ('admin', 'superadmin');

CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.admin_roles TO authenticated;
GRANT ALL ON public.admin_roles TO service_role;

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_roles WHERE user_id = _user_id)
$$;

CREATE POLICY "Users can read their own roles"
ON public.admin_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Superadmins can read all roles"
ON public.admin_roles FOR SELECT TO authenticated
USING (public.has_admin_role(auth.uid(), 'superadmin'));

-- registrations: keep public insert, restrict reads to admins
DROP POLICY IF EXISTS "Anyone can view registrations" ON public.registrations;
REVOKE SELECT ON public.registrations FROM anon;
GRANT SELECT ON public.registrations TO authenticated;

CREATE POLICY "Admins can view registrations"
ON public.registrations FOR SELECT TO authenticated
USING (public.is_any_admin(auth.uid()));
