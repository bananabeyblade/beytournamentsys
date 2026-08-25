import type { DeckReport } from "./deck-report";
import type { Top4Entry } from "./tournaments";

export interface PodiumDeckCombo {
  slot: 1 | 2 | 3;
  label: string;
  battles: number;
}

export interface PodiumDeckEntry {
  rank: number;
  name: string;
  combos: PodiumDeckCombo[];
}

const normalizedName = (value: string) => value.trim().toLocaleLowerCase();

/** Combines immutable Top 8 Deck snapshots with tracked per-battle Combo usage. */
export function buildPodiumDecks(top4: Top4Entry[], report: DeckReport): PodiumDeckEntry[] {
  return top4
    .filter((entry) => entry.rank >= 1 && entry.rank <= 3)
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => {
      const nameKey = normalizedName(entry.name);
      const snapshot = report.snapshots.find(
        (candidate) =>
          candidate.rank === entry.rank || normalizedName(candidate.participantName) === nameKey,
      );
      const usageName = normalizedName(snapshot?.participantName ?? entry.name);
      const combos = (snapshot?.comboLabels ?? []).slice(0, 3).map((label, index) => {
        const slot = (index + 1) as 1 | 2 | 3;
        const battles = report.comboUsage
          .filter(
            (usage) => normalizedName(usage.participantName) === usageName && usage.slot === slot,
          )
          .reduce((total, usage) => total + usage.battles, 0);
        return { slot, label: label || "未指定 Combo", battles };
      });
      return { rank: entry.rank, name: entry.name, combos };
    });
}
