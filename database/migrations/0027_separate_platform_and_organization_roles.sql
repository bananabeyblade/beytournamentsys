-- Organization ownership is authoritative for tenant administration. Remove
-- the temporary global superadmin bridge granted to self-service Google
-- organization owners, while preserving the fixed platform owner. Explicit
-- platform authority remains independently stored in platform_roles.
DELETE FROM admin_roles AS legacy_role
USING app_users AS account
WHERE legacy_role.user_id = account.id
  AND legacy_role.role = 'superadmin'::app_role
  AND account.google_subject IS NOT NULL
  AND lower(account.email) <> 'john410403123@gmail.com'
  AND EXISTS (
    SELECT 1
    FROM organization_memberships AS membership
    WHERE membership.user_id = account.id
      AND membership.role = 'owner'::organization_member_role
      AND membership.status = 'active'::organization_member_status
  );
