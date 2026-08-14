import type { Match } from "./tournament-types";

/** The first round whose participants form the last-eight field. */
export function top8StartRound(matches: Match[]): number | null {
  const main = matches.filter((match) => match.kind !== "third");
  if (!main.length) return null;
  return Math.max(0, Math.max(...main.map((match) => match.round)) - 2);
}

export function isTop8Match(match: Match, matches: Match[]): boolean {
  const start = top8StartRound(matches);
  return start !== null && match.round >= start;
}
