import type { DeckCombo, PartType } from "./deck";
import { railwayApi } from "./railway-api";

export interface DeckSnapshot {
  playerId: string;
  participantName: string;
  /** Deck frozen at Top 8 qualification, used for historical reports. */
  combos: DeckCombo[];
  /** Player's latest saved Deck, used by referees while the event is live. */
  currentCombos: DeckCombo[];
  comboLabels: string[];
  rank?: number;
}

/** A player's current Deck, matched to the live bracket player id for referees. */
export interface RefereeDeck {
  playerId: string;
  currentCombos: DeckCombo[];
  /** One Chinese Blade name for each combo, in the same order as currentCombos. */
  comboBladeLabels: string[];
}

export interface DeckReportPart {
  id: string;
  name: string;
  nameEn: string;
  code: string;
  partType: PartType;
  participantCount: number;
}

export interface ComboUsageEntry {
  participantName: string;
  slot: 1 | 2 | 3;
  battles: number;
}

export interface DeckReport {
  qualifierCount: number;
  registeredComboCount: number;
  trackedBattleCount: number;
  snapshots: DeckSnapshot[];
  refereeDecks: RefereeDeck[];
  partUsage: DeckReportPart[];
  comboUsage: ComboUsageEntry[];
}

export async function fetchDeckReport(tournamentId: string): Promise<DeckReport> {
  return railwayApi<DeckReport>(
    `/api/admin/deck-report?tournamentId=${encodeURIComponent(tournamentId)}`,
  );
}
