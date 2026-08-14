import { describe, expect, it } from "vitest";
import { buildBracket } from "./bracket";
import { isTop8Match, top8StartRound } from "./top8";
import type { Player, ScoreEvent } from "./tournament-types";

const players = (count: number): Player[] =>
  Array.from({ length: count }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Player ${index + 1}`,
    seed: index + 1,
  }));

describe("top-eight tracking", () => {
  it("tracks only the last three main-draw rounds for 128 players", () => {
    const matches = buildBracket(players(128), () => 0.5);
    expect(top8StartRound(matches)).toBe(4);
    expect(matches.filter((match) => isTop8Match(match, matches))).toHaveLength(8);
  });

  it("allows the same combo to be recorded again after three battles", () => {
    const events: ScoreEvent[] = [
      { slot: 1, type: "spin", points: 1, combo1Slot: 1, combo2Slot: 2 },
      { slot: 2, type: "over", points: 2, combo1Slot: 2, combo2Slot: 3 },
      { slot: 1, type: "burst", points: 2, combo1Slot: 3, combo2Slot: 1 },
      { slot: 2, type: "spin", points: 1, combo1Slot: 1, combo2Slot: 2 },
    ];

    expect(events[3].combo1Slot).toBe(events[0].combo1Slot);
    expect(events[3].combo2Slot).toBe(events[0].combo2Slot);
  });
});
