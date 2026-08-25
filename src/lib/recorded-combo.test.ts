import { describe, expect, it } from "vitest";
import type { DeckCombo } from "./deck";
import { snapshotSelectedCombo } from "./recorded-combo";

describe("snapshotSelectedCombo", () => {
  it("keeps an immutable copy when the current Deck is edited later", () => {
    const combo: DeckCombo = {
      slot: 1,
      mode: "standard",
      bladeId: "blade-old",
      ratchetId: "ratchet-1-60",
      bitId: "bit-h",
    };
    const snapshot = snapshotSelectedCombo([combo], ["魔導神杖 / 1-60 / H軸"], 1);

    combo.bladeId = "blade-new";

    expect(snapshot).toEqual({
      slot: 1,
      combo: {
        slot: 1,
        mode: "standard",
        bladeId: "blade-old",
        ratchetId: "ratchet-1-60",
        bitId: "bit-h",
      },
      label: "魔導神杖 / 1-60 / H軸",
    });
  });

  it("returns no snapshot when the selected slot is unavailable", () => {
    expect(snapshotSelectedCombo([], [], 1)).toBeUndefined();
  });
});
