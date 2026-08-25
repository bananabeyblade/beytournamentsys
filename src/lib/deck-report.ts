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
  /** Chinese Blade-only labels used by the referee selector fallback. */
  comboBladeLabels?: string[];
  rank?: number;
}

/** A player's current Deck, matched to the live bracket player id for referees. */
export interface RefereeDeck {
  /** Bracket player id when the current roster can be matched. */
  playerId: string | null;
  /** Kept even when a bracket player id is unavailable, so referees can match by name. */
  participantName: string;
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
  confirmedVariantParticipantCount: number;
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
  /** Maps historical catalogue variant IDs to the functional canonical ID used for statistics. */
  partCanonicalIds: Record<string, string>;
  comboUsage: ComboUsageEntry[];
}

export async function fetchDeckReport(tournamentId: string): Promise<DeckReport> {
  return railwayApi<DeckReport>(
    `/api/admin/deck-report?tournamentId=${encodeURIComponent(tournamentId)}`,
  );
}
