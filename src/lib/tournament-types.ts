export type Role = "admin" | "player";

export type FinishType = "spin" | "over" | "burst" | "xtreme";

export const FINISHES: {
  type: FinishType;
  points: number;
  label: string;
  zh: string;
  tone: "spin" | "over" | "burst" | "xtreme";
}[] = [
  { type: "spin", points: 1, label: "Spin Finish", zh: "迴轉勝利", tone: "spin" },
  { type: "over", points: 2, label: "Over Finish", zh: "擊飛勝利", tone: "over" },
  { type: "burst", points: 2, label: "Burst Finish", zh: "爆裂勝利", tone: "burst" },
  { type: "xtreme", points: 3, label: "Xtreme Finish", zh: "極限勝利", tone: "xtreme" },
];

export const WIN_TARGET = 4;

export interface Player {
  id: string;
  name: string;
  seed: number;
}

export type MatchStatus = "waiting" | "ready" | "live" | "done";

export interface ScoreEvent {
  slot: 1 | 2;
  type: FinishType;
  points: number;
}

export interface Match {
  id: string;
  round: number;
  index: number;
  p1: string | null;
  p2: string | null;
  score1: number;
  score2: number;
  status: MatchStatus;
  table: number | null;
  winner: string | null;
  events: ScoreEvent[];
  nextMatchId: string | null;
  nextSlot: 1 | 2 | null;
  /** Bumped on every edit so concurrent referees merge instead of overwrite. */
  rev?: number;
  /** Epoch millis of the last edit — tie-breaker for equal revisions. */
  updatedAt?: number;
}

export interface CloudAdmin {
  id: string;
  email: string;
  isSuper: boolean;
}

export interface TournamentState {
  players: Player[];
  matches: Match[];
  tableCount: number;
}
