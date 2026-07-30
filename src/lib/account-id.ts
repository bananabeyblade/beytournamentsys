/** Internal domain used to turn a custom admin username into a Supabase login email. */
export const USERNAME_DOMAIN = "beyx.local";

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

/** Accepts either a real email (superadmin) or a custom username (admins). */
export function toLoginEmail(id: string): string {
  const v = id.trim();
  if (v.includes("@")) return v;
  return `${v.toLowerCase()}@${USERNAME_DOMAIN}`;
}

/** Displays a username without the internal domain suffix. */
export function displayAccount(id: string | null | undefined): string {
  if (!id) return "";
  return id.endsWith(`@${USERNAME_DOMAIN}`) ? id.slice(0, -(USERNAME_DOMAIN.length + 1)) : id;
}

/** Only this account may create or delete superadmins. */
export const OWNER_EMAIL = "john410403123@gmail.com";

export function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}
