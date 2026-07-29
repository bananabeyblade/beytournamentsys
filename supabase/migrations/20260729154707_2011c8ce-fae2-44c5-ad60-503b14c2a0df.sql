DELETE FROM public.admin_roles WHERE user_id = '8d788d51-7a24-4d74-a2bf-d3ac4d182559';
DELETE FROM auth.users WHERE id = '8d788d51-7a24-4d74-a2bf-d3ac4d182559';
INSERT INTO public.admin_roles (user_id, email, role)
VALUES ('150dbefd-934a-41a2-a2cc-8fa3e1657185', 'john410403123@gmail.com', 'superadmin')
ON CONFLICT (user_id, role) DO NOTHING;