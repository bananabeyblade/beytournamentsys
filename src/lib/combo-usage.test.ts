import { describe, expect, it } from "vitest";
import { collectComboUsage } from "./combo-usage";

const combo = (bladeId: string, label: string) => ({
  slot: 1,
  combo: {
    slot: 1,
    mode: "standard",
    bladeId,
    ratchetId: "ratchet-1-60",
    bitId: "bit-h",
  },
  label,
});

describe("collectComboUsage", () => {
  it("keeps different real Combos separate after a Deck edit", () => {
    const result = collectComboUsage(
      [
        {
          p1: "p1",
          p2: "p2",
          events: [
            { combo1Slot: 1, combo1Snapshot: combo("blade-old", "魔導神杖 / 1-60 / H軸") },
            { combo1Slot: 1, combo1Snapshot: combo("blade-new", "飛龍懸浮 / 1-60 / H軸") },
          ],
        },
      ],
      new Map([["p1", "選手一"]]),
    );

    expect(result.trackedBattleCount).toBe(2);
    expect(result.comboUsage).toEqual([
      expect.objectContaining({
        participantName: "選手一",
        label: "魔導神杖 / 1-60 / H軸",
        battles: 1,
        recorded: true,
      }),
      expect.objectContaining({
        participantName: "選手一",
        label: "飛龍懸浮 / 1-60 / H軸",
        battles: 1,
        recorded: true,
      }),
    ]);
  });

  it("retains legacy slot estimates and tracks a registered player independently", () => {
    expect(
      collectComboUsage(
        [{ p1: "p1", p2: "p2", events: [{ combo1Slot: 2 }] }],
        new Map([
          ["p1", "選手一"],
          ["p2", "未登錄選手"],
        ]),
      ),
    ).toEqual({
      trackedBattleCount: 1,
      comboUsage: [{ participantName: "選手一", slot: 2, battles: 1 }],
    });
  });
});
