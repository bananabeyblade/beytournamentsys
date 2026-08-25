import { describe, expect, it } from "vitest";
import { adminTournamentListStatuses } from "./tournament-visibility";

describe("adminTournamentListStatuses", () => {
  it("keeps archived tournaments out of the history list", () => {
    expect(adminTournamentListStatuses(false)).toEqual(["open", "finished"]);
    expect(adminTournamentListStatuses(false)).not.toContain("archived");
  });

  it("only returns open tournaments for the latest active event lookup", () => {
    expect(adminTournamentListStatuses(true)).toEqual(["open"]);
  });
});
