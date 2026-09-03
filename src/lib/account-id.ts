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

/**
 * Default platform owner. Railway may override this at runtime with
 * PLATFORM_OWNER_EMAIL; VITE_PLATFORM_OWNER_EMAIL keeps legacy browser-only
 * authorization screens in sync when a different owner is configured.
 */
export const DEFAULT_OWNER_EMAIL = "john410403123@gmail.com";

const runtimeOwnerEmail =
  typeof process !== "undefined" ? process.env.PLATFORM_OWNER_EMAIL?.trim() : undefined;

/** Only this verified Google account may perform platform-owner operations. */
export const OWNER_EMAIL = (
  runtimeOwnerEmail ||
  import.meta.env.VITE_PLATFORM_OWNER_EMAIL ||
  DEFAULT_OWNER_EMAIL
)
  .trim()
  .toLowerCase();

export function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}

/** The developer account — same identity as the owner, used for developer-only UI/features. */
export const DEVELOPER_EMAIL = OWNER_EMAIL;

export function isDeveloperEmail(email: string | null | undefined): boolean {
  return isOwnerEmail(email);
}
