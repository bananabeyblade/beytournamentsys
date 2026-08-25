import type { DeckCombo } from "./deck";
import type { RecordedComboSnapshot } from "./tournament-types";

const slotLabel = (slot: number) => `Combo ${String.fromCharCode(64 + slot)}`;

/** Copies the selected Combo so later Deck edits cannot change a completed score event. */
export function snapshotSelectedCombo(
  combos: DeckCombo[],
  labels: string[],
  selectedSlot?: 1 | 2 | 3,
): RecordedComboSnapshot | undefined {
  const index = combos.findIndex((combo) => combo.slot === selectedSlot);
  if (index < 0) return undefined;
  const combo = combos[index];
  return {
    slot: combo.slot,
    combo: { ...combo },
    label: labels[index]?.trim() || slotLabel(combo.slot),
  };
}
