import { describe, expect, it } from "vitest";
import { sanitizePublicLiveState } from "./public-live-state";

describe("sanitizePublicLiveState", () => {
  it("removes exact Combo snapshots while preserving public scores and legacy slots", () => {
    const source = {
      players: [{ id: "p1", name: "選手一" }],
      matches: [
        {
          id: "m1",
          score1: 1,
          events: [
            {
              slot: 1,
              points: 1,
              combo1Slot: 1,
              combo2Slot: 2,
              combo1Snapshot: { label: "不應公開的 Combo" },
              combo2Snapshot: { label: "不應公開的 Combo" },
            },
          ],
        },
      ],
    };

    expect(sanitizePublicLiveState(source)).toEqual({
      players: source.players,
      matches: [
        {
          id: "m1",
          score1: 1,
          events: [{ slot: 1, points: 1, combo1Slot: 1, combo2Slot: 2 }],
        },
      ],
    });
    expect(source.matches[0].events[0].combo1Snapshot).toBeDefined();
  });
});
