import type { DeckCombo } from "./deck";

export interface ComboUsageEntry {
  participantName: string;
  slot: 1 | 2 | 3;
  battles: number;
  /** Present for new score events that saved the exact Combo at scoring time. */
  label?: string;
  combo?: DeckCombo;
  /** False or absent means the entry was inferred from a legacy A/B/C slot. */
  recorded?: boolean;
}

type UnknownRecord = Record<string, unknown>;

const comboFields = [
  "mode",
  "bladeId",
  "lockChipId",
  "mainBladeId",
  "assistBladeId",
  "metalBladeId",
  "overBladeId",
  "ratchetId",
  "bitId",
] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const comboSlot = (value: unknown): 1 | 2 | 3 | undefined => {
  const slot = Number(value);
  return slot === 1 || slot === 2 || slot === 3 ? slot : undefined;
};

function exactSnapshot(value: unknown) {
  if (!isRecord(value) || !isRecord(value.combo)) return undefined;
  const slot = comboSlot(value.slot);
  if (!slot) return undefined;
  const combo = { ...value.combo, slot } as unknown as DeckCombo;
  const label = typeof value.label === "string" ? value.label.trim() : "";
  const fingerprint = comboFields.map((field) => combo[field] ?? "").join("\u0001");
  return { slot, combo, label: label || `Combo ${String.fromCharCode(64 + slot)}`, fingerprint };
}

export function collectComboUsage(
  matches: unknown[],
  playerNames: Map<string, string>,
): { trackedBattleCount: number; comboUsage: ComboUsageEntry[] } {
  const counts = new Map<string, ComboUsageEntry>();
  let trackedBattleCount = 0;

  for (const rawMatch of matches) {
    if (!isRecord(rawMatch) || !Array.isArray(rawMatch.events)) continue;
    const playerIds = [rawMatch.p1, rawMatch.p2];
    for (const rawEvent of rawMatch.events) {
      if (!isRecord(rawEvent)) continue;
      let tracked = false;

      for (const side of [0, 1] as const) {
        const playerId = playerIds[side];
        if (typeof playerId !== "string") continue;
        const participantName = playerNames.get(playerId);
        if (!participantName) continue;

        const exact = exactSnapshot(rawEvent[side === 0 ? "combo1Snapshot" : "combo2Snapshot"]);
        const legacySlot = comboSlot(rawEvent[side === 0 ? "combo1Slot" : "combo2Slot"]);
        const slot = exact?.slot ?? legacySlot;
        if (!slot) continue;

        const key = exact
          ? `${participantName}\u0000recorded\u0000${exact.fingerprint}`
          : `${participantName}\u0000legacy\u0000${slot}`;
        const current = counts.get(key);
        if (current) current.battles += 1;
        else {
          counts.set(key, {
            participantName,
            slot,
            battles: 1,
            ...(exact && {
              label: exact.label,
              combo: exact.combo,
              recorded: true,
            }),
          });
        }
        tracked = true;
      }

      if (tracked) trackedBattleCount += 1;
    }
  }

  return {
    trackedBattleCount,
    comboUsage: [...counts.values()].sort(
      (left, right) =>
        right.battles - left.battles ||
        left.participantName.localeCompare(right.participantName) ||
        left.slot - right.slot,
    ),
  };
}
