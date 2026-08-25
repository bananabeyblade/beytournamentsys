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
const usageKey = (name: string, slot: number) => `${normalizedName(name)}\u0000${slot}`;

/** Combines immutable Top 8 Deck snapshots with tracked per-battle Combo usage. */
export function buildPodiumDecks(top4: Top4Entry[], report: DeckReport): PodiumDeckEntry[] {
  const snapshotsByName = new Map(
    report.snapshots.map((snapshot) => [normalizedName(snapshot.participantName), snapshot]),
  );
  const snapshotsByRank = new Map(
    report.snapshots
      .filter((snapshot) => snapshot.rank !== undefined)
      .map((snapshot) => [snapshot.rank, snapshot]),
  );
  const battlesByCombo = new Map<string, number>();
  for (const usage of report.comboUsage) {
    const key = usageKey(usage.participantName, usage.slot);
    battlesByCombo.set(key, (battlesByCombo.get(key) ?? 0) + usage.battles);
  }

  return top4
    .filter((entry) => entry.rank >= 1 && entry.rank <= 3)
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => {
      const nameKey = normalizedName(entry.name);
      // Prefer identity over rank: imported legacy reports can contain stale rank metadata.
      const snapshot = snapshotsByName.get(nameKey) ?? snapshotsByRank.get(entry.rank);
      const usageName = snapshot?.participantName ?? entry.name;
      const combos = (snapshot?.comboLabels ?? []).slice(0, 3).map((label, index) => {
        const slot = (index + 1) as 1 | 2 | 3;
        const battles = battlesByCombo.get(usageKey(usageName, slot)) ?? 0;
        return { slot, label: label || "未指定 Combo", battles };
      });
      return { rank: entry.rank, name: entry.name, combos };
    });
}
