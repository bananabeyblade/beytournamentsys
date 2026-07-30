import { USERNAME_DOMAIN } from "./account-id";

/**
 * The cloud auth service enforces a global minimum password length that cannot
 * go below 6 characters. Custom-username admin accounts are allowed 4-character
 * passwords, so a fixed internal suffix is appended before the password reaches
 * the auth service. Users still type only their own short password.
 */
export const ADMIN_PASSWORD_PEPPER = "#beyx.pad";

export const ADMIN_PASSWORD_MIN = 4;

export function padAdminPassword(password: string): string {
  return `${password}${ADMIN_PASSWORD_PEPPER}`;
}

/** True for custom admin usernames (no real email), which use the padded scheme. */
export function isUsernameAccount(account: string): boolean {
  const v = account.trim().toLowerCase();
  return !v.includes("@") || v.endsWith(`@${USERNAME_DOMAIN}`);
}
