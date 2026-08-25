import type { DeckCombo } from "./deck";

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

/** Immutable copy of the Combo selected when a score event was recorded. */
export interface RecordedComboSnapshot {
  slot: 1 | 2 | 3;
  combo: DeckCombo;
  label: string;
}

export interface ScoreComboSnapshots {
  player1?: RecordedComboSnapshot;
  player2?: RecordedComboSnapshot;
}

export interface ScoreEvent {
  slot: 1 | 2;
  type: FinishType;
  points: number;
  /** Top-eight tracking: both players' selected Combo for this battle. */
  combo1Slot?: 1 | 2 | 3;
  combo2Slot?: 1 | 2 | 3;
  /** Exact Combo records. Optional so tournaments created before this field remain readable. */
  combo1Snapshot?: RecordedComboSnapshot;
  combo2Snapshot?: RecordedComboSnapshot;
  recordedAt?: number;
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
  /** "third" marks the 3rd/4th place play-off fed by the semi-final losers. */
  kind?: "main" | "third";
  /** Where the loser goes (used by the semi-finals to fill the bronze match). */
  loserNextMatchId?: string | null;
  loserNextSlot?: 1 | 2 | null;
  /** Bumped on every edit so concurrent referees merge instead of overwrite. */
  rev?: number;
  /** Epoch millis of the last edit — tie-breaker for equal revisions. */
  updatedAt?: number;
  /** Edit lock: admin user id currently scoring this bout. */
  lockedBy?: string | null;
  /** Display name/account of the lock holder. */
  lockedByName?: string | null;
  /** Epoch millis of the last lock heartbeat — expires after LOCK_TTL_MS. */
  lockedAt?: number | null;
}

export interface CloudAdmin {
  id: string;
  email: string;
  isSuper: boolean;
  isGoogle: boolean;
  /** Event-scoped referee approved through a tournament QR invitation. */
  isReferee?: boolean;
  tournamentId?: string;
  tournamentCode?: string;
}

export interface TournamentState {
  players: Player[];
  matches: Match[];
  tableCount: number;
}
