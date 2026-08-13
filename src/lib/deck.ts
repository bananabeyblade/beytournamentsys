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

export async function fetchDeckParts(): Promise<BeybladePart[]> {
  if (!railwayAuthEnabled) return [];
  return (await railwayApi<{ parts: BeybladePart[] }>("/api/registrations?parts=1")).parts;
}

export async function loadParticipantDeck(
  tournamentId: string,
  name: string,
  recoveryCode: string,
): Promise<DeckCombo[]> {
  if (!railwayAuthEnabled) return [];
  return (
    await railwayApi<{ combos: DeckCombo[] }>("/api/registrations", {
      method: "POST",
      body: JSON.stringify({ action: "load-deck", tournamentId, name, recoveryCode }),
    })
  ).combos;
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
