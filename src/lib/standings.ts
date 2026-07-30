import type { Match, Player } from "./tournament-types";
import type { TournamentResults, Top4Entry } from "./tournaments";

/**
 * Derives the podium (1st–4th) from a finished single-elimination bracket.
 * 3rd/4th are the two semi-final losers, ordered by the points they scored.
 */
export function computeTop4(matches: Match[], players: Player[]): TournamentResults | null {
  if (!matches.length) return null;
  const totalRounds = Math.max(...matches.map((m) => m.round)) + 1;
  const final = matches.find((m) => m.round === totalRounds - 1);
  if (!final || final.status !== "done" || !final.winner) return null;

  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? "—";
  const loserOf = (m: Match) => (m.winner === m.p1 ? m.p2 : m.p1);

  const top4: Top4Entry[] = [
    { rank: 1, name: nameOf(final.winner) },
    { rank: 2, name: nameOf(loserOf(final)) },
  ];

  // Only semi-finals that were actually decided count — a force-finished
  // (never played) bout must not invent a 3rd/4th place.
  const semis = matches.filter(
    (m) => m.round === totalRounds - 2 && m.status === "done" && !!m.winner,
  );
  const third = semis
    .map((m) => ({
      id: loserOf(m),
      pts: m.winner === m.p1 ? m.score2 : m.score1,
    }))
    .filter((x) => x.id)
    .sort((a, b) => b.pts - a.pts);


  third.slice(0, 2).forEach((x, i) => top4.push({ rank: 3 + i, name: nameOf(x.id) }));

  return { top4, playerCount: players.length };
}
