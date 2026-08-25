import { describe, expect, it } from "vitest";
import type { DeckReport } from "./deck-report";
import { buildPodiumDecks } from "./podium-decks";

const report: DeckReport = {
  qualifierCount: 3,
  registeredComboCount: 5,
  trackedBattleCount: 4,
  snapshots: [
    {
      playerId: "p1",
      participantName: "冠軍選手",
      combos: [],
      currentCombos: [],
      comboLabels: ["魔導神杖 / 1-60 / H軸", "鮫鯊狂鱗 / 3-60 / F軸"],
      rank: 1,
    },
    {
      playerId: "p2",
      participantName: "亞軍選手",
      combos: [],
      currentCombos: [],
      comboLabels: ["霜灰銀狼 / 9-60 / FB軸"],
      rank: 2,
    },
  ],
  refereeDecks: [],
  partUsage: [],
  partCanonicalIds: {},
  comboUsage: [
    { participantName: "冠軍選手", slot: 1, battles: 3 },
    { participantName: "冠軍選手", slot: 2, battles: 1 },
  ],
};

describe("buildPodiumDecks", () => {
  it("combines the top three snapshots with tracked Combo battle counts", () => {
    expect(
      buildPodiumDecks(
        [
          { rank: 3, name: "季軍選手" },
          { rank: 1, name: "冠軍選手" },
          { rank: 2, name: "亞軍選手" },
          { rank: 4, name: "殿軍選手" },
        ],
        report,
      ),
    ).toEqual([
      {
        rank: 1,
        name: "冠軍選手",
        combos: [
          { slot: 1, label: "魔導神杖 / 1-60 / H軸", battles: 3 },
          { slot: 2, label: "鮫鯊狂鱗 / 3-60 / F軸", battles: 1 },
        ],
      },
      {
        rank: 2,
        name: "亞軍選手",
        combos: [{ slot: 1, label: "霜灰銀狼 / 9-60 / FB軸", battles: 0 }],
      },
      { rank: 3, name: "季軍選手", combos: [] },
    ]);
  });
});
