import type { DeckReport } from "./deck-report";
import type { Top4Entry } from "./tournaments";

export interface PodiumDeckCombo {
  slot: 1 | 2 | 3;
  label: string;
}

export interface PodiumPlayedCombo {
  key: string;
  label: string;
  battles: number;
  estimated: boolean;
}

export interface PodiumDeckEntry {
  rank: number;
  name: string;
  combos: PodiumDeckCombo[];
  playedCombos: PodiumPlayedCombo[];
}

const normalizedName = (value: string) => value.trim().toLocaleLowerCase();

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

  return top4
    .filter((entry) => entry.rank >= 1 && entry.rank <= 3)
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => {
      const nameKey = normalizedName(entry.name);
      // Prefer identity over rank: imported legacy reports can contain stale rank metadata.
      const snapshot = snapshotsByName.get(nameKey) ?? snapshotsByRank.get(entry.rank);
      const usageName = snapshot?.participantName ?? entry.name;
      const combos = (snapshot?.comboLabels ?? []).slice(0, 3).map((label, index) => ({
        slot: (index + 1) as 1 | 2 | 3,
        label: label || "未指定 Combo",
      }));
      const played = new Map<string, PodiumPlayedCombo>();
      for (const usage of report.comboUsage) {
        if (normalizedName(usage.participantName) !== normalizedName(usageName)) continue;
        const exact = usage.recorded === true && !!usage.label;
        const label = exact
          ? usage.label!
          : (combos.find((combo) => combo.slot === usage.slot)?.label ??
            `Combo ${String.fromCharCode(64 + usage.slot)}`);
        const key = exact
          ? `recorded:${JSON.stringify(usage.combo ?? label)}`
          : `legacy:${usage.slot}`;
        const previous = played.get(key);
        if (previous) previous.battles += usage.battles;
        else played.set(key, { key, label, battles: usage.battles, estimated: !exact });
      }
      const playedCombos = [...played.values()].sort(
        (left, right) => right.battles - left.battles || left.label.localeCompare(right.label),
      );
      return { rank: entry.rank, name: entry.name, combos, playedCombos };
    });
}
