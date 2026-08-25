export type TournamentStatus = "open" | "finished" | "archived";

const openStatuses = ["open"] as const satisfies readonly TournamentStatus[];
const historyStatuses = ["open", "finished"] as const satisfies readonly TournamentStatus[];
const statisticsStatuses = [
  "open",
  "finished",
  "archived",
] as const satisfies readonly TournamentStatus[];

/** Statuses shown in the admin tournament list. Archived events remain stored but stay hidden. */
export function adminTournamentListStatuses(latestOpen: boolean): readonly TournamentStatus[] {
  return latestOpen ? openStatuses : historyStatuses;
}

/** Developer statistics include archived events because archiving only changes list visibility. */
export function developerStatisticsTournamentStatuses(): readonly TournamentStatus[] {
  return statisticsStatuses;
}
