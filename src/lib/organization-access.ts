export type OrganizationRole = "owner" | "admin";
export type PlatformRole = "developer" | "support";

export interface OrganizationAccess {
  organizationRole: OrganizationRole | null;
  platformRole: PlatformRole | null;
}

export function organizationAccessAllows(
  access: OrganizationAccess,
  allowedRoles: readonly OrganizationRole[],
  allowedPlatformRoles: readonly PlatformRole[] = [],
) {
  if (access.platformRole !== null && allowedPlatformRoles.includes(access.platformRole)) {
    return true;
  }
  return access.organizationRole !== null && allowedRoles.includes(access.organizationRole);
}
