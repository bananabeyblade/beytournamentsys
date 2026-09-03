export const ALLOWED_TOURNAMENT_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const TOURNAMENT_LOGO_ACCEPT = ALLOWED_TOURNAMENT_LOGO_TYPES.join(",");

type TournamentLogoType = (typeof ALLOWED_TOURNAMENT_LOGO_TYPES)[number];
const assetPathPattern =
  /^\/api\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Verifies the file signature as well as the browser-supplied MIME type.
 * SVG is deliberately unsupported because assets are served from the app origin.
 */
export function isValidTournamentLogo(contentType: string, bytes: Uint8Array): boolean {
  const validators: Record<TournamentLogoType, () => boolean> = {
    "image/png": () => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "image/jpeg": () => startsWith(bytes, [0xff, 0xd8, 0xff]),
    "image/webp": () =>
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50,
  };

  return contentType in validators && validators[contentType as TournamentLogoType]();
}

export function tournamentAssetResponseHeaders(contentType: string) {
  return {
    "content-type": contentType,
    "cache-control": "public,max-age=31536000,immutable",
    "content-security-policy": "default-src 'none'; script-src 'none'; sandbox",
    "x-content-type-options": "nosniff",
  };
}

export function tournamentAssetIdFromPath(value: string): string | null {
  return assetPathPattern.exec(value)?.[1] ?? null;
}
