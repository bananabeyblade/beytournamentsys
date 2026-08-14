import type { DeckCombo, PartType } from "./deck";
import { railwayApi } from "./railway-api";

export interface DeckSnapshot {
  playerId: string;
  participantName: string;
  combos: DeckCombo[];
  comboLabels: string[];
  rank?: number;
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
  partUsage: DeckReportPart[];
  comboUsage: ComboUsageEntry[];
}

export async function fetchDeckReport(tournamentId: string): Promise<DeckReport> {
  return railwayApi<DeckReport>(
    `/api/admin/deck-report?tournamentId=${encodeURIComponent(tournamentId)}`,
  );
}
