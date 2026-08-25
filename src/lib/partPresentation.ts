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
  if (part.partType === "assist_blade" || part.partType === "over_blade") {
    const name = localizedName(part);
    const code = (part.functionalCode || part.code).trim().toUpperCase();
    return name ? `${name}(${code})` : code;
  }
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

function ratchetNumbers(part: BeybladePart) {
  const match = ratchetValue(part).match(/^(\d+)-(\d+)$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** Stable player-facing order: Ratchets by both numbers, Bits alphabetically. */
export function compareParts(left: BeybladePart, right: BeybladePart) {
  if (left.partType === "ratchet" && right.partType === "ratchet") {
    const leftNumbers = ratchetNumbers(left);
    const rightNumbers = ratchetNumbers(right);
    if (leftNumbers && rightNumbers) {
      return leftNumbers[0] - rightNumbers[0] || leftNumbers[1] - rightNumbers[1];
    }
    if (leftNumbers) return -1;
    if (rightNumbers) return 1;
    return ratchetValue(left).localeCompare(ratchetValue(right), "en", { numeric: true });
  }
  if (left.partType === "bit" && right.partType === "bit") {
    return bitValue(left).localeCompare(bitValue(right), "en", {
      numeric: true,
      sensitivity: "base",
    });
  }
  return partDisplayLabel(left).localeCompare(partDisplayLabel(right), "zh-Hant", {
    numeric: true,
  });
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
    return /^[A-Z][A-Z0-9]*$/.test(codeQuery) && bitValue(part).includes(codeQuery);
  }
  return [localizedName(part), part.functionalCode, part.code]
    .filter(Boolean)
    .some((value) => normalize(value).includes(normalizedQuery));
}
