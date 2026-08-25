import type { BeybladePart } from "./deck";

const MODEL_RE = /\b(?:CX|BX|UX)[A-Z0-9]*(?:-[A-Z0-9]+)+\b/i;
const RATCHET_RE = /\b\d+\s*-\s*\d+\b/;

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function compact(value: string) {
  return normalize(value).replace(/[\s-]/g, "");
}

function values(part: BeybladePart) {
  return [
    part.setId,
    part.name,
    part.nameEn,
    part.code,
    part.functionalCode,
    part.sourcePartId,
    part.packageId,
    part.color,
    part.system,
  ].filter(Boolean);
}

export function partModel(part: BeybladePart) {
  for (const value of values(part)) {
    const model = value.match(MODEL_RE)?.[0]?.toUpperCase();
    if (!model) continue;
    const tokens = model.split("-");
    // The last two numeric groups are catalogue colour/variant IDs, not the
    // player-facing product model (BXH-25-01 → BXH-25).
    if (
      tokens.length >= 3 &&
      /^\d{2}$/.test(tokens.at(-1) ?? "") &&
      /^\d+$/.test(tokens.at(-2) ?? "")
    ) {
      return tokens.slice(0, -1).join("-");
    }
    return model;
  }
  return "";
}

export function ratchetValue(part: BeybladePart) {
  for (const value of [part.functionalCode, part.code]) {
    const match = value.trim().match(/^(\d+\s*-\s*\d+)$/)?.[1];
    if (match) return match.replace(/\s/g, "");
  }
  for (const value of [part.name, part.nameEn]) {
    const matches = [...value.matchAll(new RegExp(RATCHET_RE, "g"))];
    const match = matches.at(-1)?.[0];
    if (match) return match.replace(/\s/g, "");
  }
  return part.functionalCode || part.code;
}

export function bitValue(part: BeybladePart) {
  for (const value of [part.functionalCode, part.code]) {
    const candidate = value.trim().toUpperCase();
    if (/^[A-Z][A-Z0-9]*$/.test(candidate) && !["BX", "UX", "CX"].includes(candidate)) {
      return candidate;
    }
  }
  return part.functionalCode || part.code;
}

function localizedName(part: BeybladePart) {
  const model = partModel(part);
  const text = part.name.replace(MODEL_RE, " ").replace(model, " ");
  return text.match(/[\u3400-\u9fff]+/g)?.join(" ") ?? "";
}

/** Functional labels for the fast Deck picker, without product, colour or catalogue details. */
export function partDisplayLabel(part: BeybladePart) {
  const isBlade = part.partType === "blade" || part.partType.endsWith("blade");
  if (isBlade) {
    return localizedName(part) || part.functionalCode || part.code;
  }
  if (part.partType === "ratchet") return ratchetValue(part);
  if (part.partType === "bit") return `${bitValue(part)}軸`;
  if (part.partType === "lock_chip") {
    return localizedName(part) || part.functionalCode || part.code || "鎖定紋章";
  }
  return localizedName(part) || part.functionalCode || part.code;
}

/** Matches only player-facing functional names and codes, never hidden catalogue metadata. */
export function partMatchesQuery(part: BeybladePart, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  if (part.partType === "ratchet" && /^\d+\s*-\s*\d+$/.test(normalizedQuery)) {
    return compact(ratchetValue(part)) === compact(normalizedQuery);
  }
  if (part.partType === "ratchet") {
    return compact(ratchetValue(part)).startsWith(compact(normalizedQuery));
  }
  if (part.partType === "bit") {
    const codeQuery = normalizedQuery.replace(/軸$/, "").toUpperCase();
    return /^[A-Z][A-Z0-9]*$/.test(codeQuery) && bitValue(part).startsWith(codeQuery);
  }
  return [localizedName(part), part.functionalCode, part.code]
    .filter(Boolean)
    .some((value) => normalize(value).includes(normalizedQuery));
}
