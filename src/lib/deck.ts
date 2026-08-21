import { railwayApi, railwayAuthEnabled } from "./railway-api";

export type PartType =
  | "blade"
  | "ratchet"
  | "bit"
  | "lock_chip"
  | "main_blade"
  | "assist_blade"
  | "metal_blade"
  | "over_blade";

export interface BeybladePart {
  id: string;
  name: string;
  nameEn: string;
  code: string;
  partType: PartType;
  system: string;
  sourcePartId: string;
  functionalCode: string;
  packageId: string;
  setId: string;
  color: string;
  brandSource: string;
}

export interface DeckCombo {
  slot: 1 | 2 | 3;
  mode: "standard" | "custom";
  bladeId?: string;
  lockChipId?: string;
  mainBladeId?: string;
  assistBladeId?: string;
  metalBladeId?: string;
  overBladeId?: string;
  ratchetId: string;
  bitId: string;
}

/** The compact, player-facing part label used in Deck pickers and referee logs.
 * Raw catalogue names include revision/colour/system suffixes; those are useful
 * for imports, but make a phone-sized picker hard to scan. */
export function partModelLabel(
  part: Pick<BeybladePart, "partType" | "code" | "functionalCode" | "name">,
) {
  const raw = (part.functionalCode || part.code || "").trim();
  const match = raw.match(/^([A-Za-z]+(?:[A-Za-z]+)?-\d{2})/);
  const model = match?.[1] ?? raw.replace(/[-\s].*$/, "");
  return part.partType === "blade" || part.partType.endsWith("blade")
    ? `${model} ${part.name}`.trim()
    : model;
}

export async function fetchDeckParts(): Promise<BeybladePart[]> {
  if (!railwayAuthEnabled) return [];
  return (await railwayApi<{ parts: BeybladePart[] }>("/api/registrations?parts=1")).parts;
}

export async function loadParticipantDeck(
  tournamentId: string,
  name: string,
  recoveryCode: string,
): Promise<{ combos: DeckCombo[]; locked: boolean }> {
  if (!railwayAuthEnabled) return { combos: [], locked: false };
  return await railwayApi<{ combos: DeckCombo[]; locked: boolean }>("/api/registrations", {
    method: "POST",
    body: JSON.stringify({ action: "load-deck", tournamentId, name, recoveryCode }),
  });
}

export async function saveParticipantDeck(
  tournamentId: string,
  name: string,
  recoveryCode: string,
  combos: DeckCombo[],
): Promise<void> {
  if (!railwayAuthEnabled) throw new Error("DECK_REGISTRATION_UNAVAILABLE");
  await railwayApi("/api/registrations", {
    method: "POST",
    body: JSON.stringify({ action: "save-deck", tournamentId, name, recoveryCode, combos }),
  });
}
