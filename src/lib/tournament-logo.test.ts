import { describe, expect, it } from "vitest";
import {
  isValidTournamentLogo,
  tournamentAssetIdFromPath,
  tournamentAssetResponseHeaders,
  TOURNAMENT_LOGO_ACCEPT,
} from "./tournament-logo";

describe("tournament logo validation", () => {
  it.each([
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ])("accepts a valid %s signature", (contentType, signature) => {
    expect(isValidTournamentLogo(contentType, new Uint8Array(signature))).toBe(true);
  });

  it("rejects SVG even when it is declared as an image", () => {
    const svg = new TextEncoder().encode('<svg><script>alert("xss")</script></svg>');
    expect(isValidTournamentLogo("image/svg+xml", svg)).toBe(false);
    expect(TOURNAMENT_LOGO_ACCEPT).not.toContain("svg");
  });

  it("rejects HTML disguised as an allowed image type", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(isValidTournamentLogo("image/png", html)).toBe(false);
  });

  it("rejects a MIME type that does not match the file signature", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(isValidTournamentLogo("image/png", jpeg)).toBe(false);
  });

  it("prevents content sniffing and script execution when an asset is opened directly", () => {
    const headers = tournamentAssetResponseHeaders("image/png");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain("script-src 'none'");
    expect(headers["content-security-policy"]).toContain("sandbox");
  });

  it("accepts only a local immutable asset URL", () => {
    const id = "20000000-0000-4000-8000-000000000002";
    expect(tournamentAssetIdFromPath(`/api/assets/${id}`)).toBe(id);
    expect(tournamentAssetIdFromPath(`https://tracker.example/logo.png`)).toBeNull();
    expect(tournamentAssetIdFromPath(`data:image/svg+xml,<svg/>`)).toBeNull();
    expect(tournamentAssetIdFromPath(`/api/assets/${id}/extra`)).toBeNull();
  });
});
