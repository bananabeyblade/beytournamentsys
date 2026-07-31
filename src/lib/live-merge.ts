import type { Match, Player } from "./tournament-types";

/**
 * Merges the incoming roster with the local one by player id, so a player added
 * on this device survives an older cloud snapshot (and two admins adding at the
 * same time never wipe each other). `removedIds` are tombstones: ids deleted
 * locally are dropped even when the cloud copy still lists them.
 */
export function mergePlayers(
  local: Player[],
  incoming: Player[],
  removedIds: Iterable<string> = [],
): Player[] {
  const removed = new Set(removedIds);
  const seen = new Set<string>();
  const out: Player[] = [];
  for (const p of [...incoming, ...local]) {
    if (removed.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  const seeded = out.map((p, i) => (p.seed === i + 1 ? p : { ...p, seed: i + 1 }));
  // Nothing actually changed → hand back the local array so React (and the
  // publish loop) sees a stable identity instead of a fake edit.
  const same =
    seeded.length === local.length && seeded.every((p, i) => p === local[i]);
  return same ? local : seeded;
}

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
