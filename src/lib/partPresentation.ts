import type { BeybladePart } from "./deck";

const MODEL_RE = /\b(?:CX|BX|UX)[A-Z0-9]*(?:-[A-Z0-9]+)+\b/i;
const RATCHET_RE = /\b\d+\s*-\s*\d+\b/;

const COLOR_ZH: Record<string, string> = {
  black: "黑色",
  white: "白色",
  red: "紅色",
  blue: "藍色",
  green: "綠色",
  yellow: "黃色",
  orange: "橘色",
  purple: "紫色",
  pink: "粉紅色",
  gold: "金色",
  silver: "銀色",
  gray: "灰色",
  grey: "灰色",
  clear: "透明",
  turquoise: "青綠色",
};

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

function colorNameZh(value: string) {
  return value
    .trim()
    .split(/[\s_\-/]+/)
    .filter(Boolean)
    .map((token) => COLOR_ZH[token.toLowerCase()] ?? token)
    .join("／");
}

/** Short labels for the Deck picker and referee screens, without catalogue IDs. */
export function partDisplayLabel(part: BeybladePart) {
  const model = partModel(part);
  const color = colorNameZh(part.color);
  const isBlade = part.partType === "blade" || part.partType.endsWith("blade");
  if (isBlade) {
    const name = localizedName(part) || part.functionalCode || part.code;
    return [model, name, color && !name.includes(color) ? color : ""].filter(Boolean).join(" · ");
  }
  if (part.partType === "ratchet") return [model, ratchetValue(part)].filter(Boolean).join(" ");
  if (part.partType === "bit") return [model, bitValue(part)].filter(Boolean).join(" ");
  if (part.partType === "lock_chip") {
    return [model, localizedName(part) || part.functionalCode || part.code || "鎖定紋章", color]
      .filter(Boolean)
      .join(" · ");
  }
  return [model, localizedName(part) || part.functionalCode || part.code, color]
    .filter(Boolean)
    .join(" · ");
}

/** Matches the displayed label and every useful local-catalogue identifier. */
export function partMatchesQuery(part: BeybladePart, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  if (part.partType === "ratchet" && /^\d+\s*-\s*\d+$/.test(normalizedQuery)) {
    return compact(ratchetValue(part)) === compact(normalizedQuery);
  }
  if (part.partType === "bit" && /^[a-z][a-z0-9]*$/i.test(normalizedQuery)) {
    return bitValue(part).toLowerCase() === normalizedQuery;
  }
  return [partDisplayLabel(part), ...values(part)].some((value) => normalize(value).includes(normalizedQuery));
}
