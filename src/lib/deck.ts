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

const MODEL_TOKEN_RE = /\b(?:CX|BX|UX)[A-Z0-9]*(?:-[A-Z0-9]+)+\b/i;
const RATCHET_CODE_RE = /\b\d+\s*-\s*\d+\b/;
const BIT_CODE_RE = /\b[A-Z]{1,3}\b/gi;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function partValues(
  part: Pick<
    BeybladePart,
    "code" | "functionalCode" | "name" | "nameEn" | "sourcePartId" | "packageId" | "setId"
  >,
) {
  return [
    part.setId,
    part.code,
    part.functionalCode,
    part.name,
    part.nameEn,
    part.sourcePartId,
    part.packageId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function normalizeModel(model: string) {
  const tokens = model.split("-");
  // Catalogue variant IDs use a final -01/-02 suffix. The player-facing model
  // should group those variants under the same base model (e.g. BX-35-04 → BX-35).
  if (
    tokens.length >= 3 &&
    /^\d{2}$/.test(tokens.at(-1) ?? "") &&
    /^\d{2}$/.test(tokens.at(-2) ?? "")
  ) {
    return tokens.slice(0, -1).join("-");
  }
  return model;
}

function partModel(part: Parameters<typeof partValues>[0]) {
  for (const value of partValues(part)) {
    const match = value.match(MODEL_TOKEN_RE);
    if (match) return normalizeModel(match[0].toUpperCase());
  }
  return "";
}

function bladeName(part: Parameters<typeof partValues>[0], model: string) {
  let name = part.name.trim();
  const rawModelMatch = name.match(MODEL_TOKEN_RE);
  if (rawModelMatch && rawModelMatch.index !== undefined) {
    // Some catalogue rows put the English name before the model (for example,
    // "WIZARDROD UX-03 魔導神杖"). Remove everything through the model so the
    // player-facing label consistently keeps only the model and Chinese name.
    name = name.slice(rawModelMatch.index + rawModelMatch[0].length).trim();
  } else if (model) name = name.replace(new RegExp(`^${escapeRegExp(model)}\\s*`, "i"), "");

  // Colour/reissue descriptions are catalogue metadata, not the player-facing
  // Chinese part name. Keep the actual name while removing those suffixes.
  name = name.replace(/\s+(?:金屬塗層|金属涂层|特殊版|特別版|限定版)[:：]?.*$/u, "").trim();
  return name || part.name.trim();
}

function ratchetCode(part: Parameters<typeof partValues>[0]) {
  // Prefer the functional/code fields: set IDs contain catalogue variant
  // suffixes such as BXH-25-01, which are not the ratchet's 4-50/9-60 spec.
  return [
    part.functionalCode,
    part.code,
    part.name,
    part.nameEn,
    part.sourcePartId,
    part.packageId,
    part.setId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .map((value) => {
      // A fallback name can contain both the catalogue model (e.g. 25-01)
      // and the actual ratchet spec (e.g. 4-50). The spec is the last numeric
      // pair in that string; never expose the model's variant suffix.
      const matches = [...value.matchAll(new RegExp(RATCHET_CODE_RE, "g"))];
      return matches.at(-1)?.[0]?.replace(/\s+/g, "");
    })
    .find(Boolean);
}

function bitCode(part: Parameters<typeof partValues>[0], model: string) {
  const functionalCode = part.functionalCode.trim();
  if (/^[A-Za-z]{1,3}$/.test(functionalCode)) return functionalCode.toUpperCase();

  for (const value of partValues(part)) {
    const withoutModel = model ? value.replace(new RegExp(escapeRegExp(model), "ig"), "") : value;
    const candidate = withoutModel
      .replace(/\([^)]*\)/g, " ")
      .match(BIT_CODE_RE)
      ?.find((token) => !/^(?:CX|BX|UX)[A-Z0-9]*$/i.test(token));
    if (candidate) return candidate.toUpperCase();
  }
  return functionalCode || part.code.trim();
}

/** The compact, player-facing part label used in Deck pickers and referee logs.
 * Raw catalogue names include revision/colour/system suffixes; those are useful
 * for imports, but make a phone-sized picker hard to scan. */
export function partModelLabel(
  part: Pick<
    BeybladePart,
    | "partType"
    | "code"
    | "functionalCode"
    | "name"
    | "nameEn"
    | "sourcePartId"
    | "packageId"
    | "setId"
  >,
) {
  const model = partModel(part);
  const isBlade = part.partType === "blade" || part.partType.endsWith("blade");
  if (isBlade) return `${model} ${bladeName(part, model)}`.trim();
  if (part.partType === "ratchet")
    return `${model} ${ratchetCode(part) || part.functionalCode}`.trim();
  if (part.partType === "bit") return `${model} ${bitCode(part, model)}`.trim();
  return `${model} ${part.functionalCode || part.code || part.name}`.trim();
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
