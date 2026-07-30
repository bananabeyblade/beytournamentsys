import type { Match } from "./tournament-types";

/** Version tuple used to decide which copy of a match is newer. */
const revOf = (m: Match) => (typeof m.rev === "number" ? m.rev : 0);
const timeOf = (m: Match) => (typeof m.updatedAt === "number" ? m.updatedAt : 0);

/** Marks a match as edited so concurrent referees can be merged, not overwritten. */
export function touchMatch(m: Match): Match {
  return { ...m, rev: revOf(m) + 1, updatedAt: Date.now() };
}

/** True when `a` should win over `b` in a merge. */
export function isNewer(a: Match, b: Match) {
  if (revOf(a) !== revOf(b)) return revOf(a) > revOf(b);
  return timeOf(a) > timeOf(b);
}

/**
 * Merges an incoming published bracket with the local one per match, so two
 * referees scoring different tables at the same time never clobber each other.
 * The incoming list defines which matches exist (bracket regeneration / reset);
 * the local copy only wins when it is a strictly newer revision of that match.
 */
export function mergeMatches(local: Match[], incoming: Match[]): Match[] {
  if (!incoming.length) return incoming;
  const mine = new Map(local.map((m) => [m.id, m]));
  return incoming.map((remote) => {
    const own = mine.get(remote.id);
    return own && isNewer(own, remote) ? own : remote;
  });
}
