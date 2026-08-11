import { describe, expect, it } from "vitest";
import { buildBracket } from "./bracket";
import type { Player } from "./tournament-types";

const players = (count: number): Player[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    seed: index + 1,
  }));

describe("buildBracket", () => {
  for (let count = 2; count <= 128; count += 1) {
    it(`keeps all ${count} entrants`, () => {
      const bracket = buildBracket(players(count), () => 0.5);
      const placed = bracket.flatMap(({ p1, p2 }) => [p1, p2]).filter(Boolean);
      expect(placed).toHaveLength(count);
      expect(new Set(placed).size).toBe(count);
      let mainDrawSize = 1;
      while (mainDrawSize * 2 <= count) mainDrawSize *= 2;
      expect(bracket).toHaveLength(count - 1 + (mainDrawSize >= 4 ? 1 : 0));
    });
  }
});
