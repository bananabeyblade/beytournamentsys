import { railwayApi } from "./railway-api";

export type RefereeStatus = "pending" | "approved" | "rejected" | "revoked";

export interface RefereeAccessRow {
  id: string;
  display_name: string;
  status: RefereeStatus;
  requested_at: string;
  decided_at: string | null;
  last_seen_at: string | null;
}

export interface RefereeAccessState {
  invite: {
    id: string;
    quota: number;
    revoked_at: string | null;
    expires_at: string | null;
    created_at: string;
  } | null;
  referees: RefereeAccessRow[];
}

export const loadRefereeAccess = (tournamentId: string) =>
  railwayApi<RefereeAccessState>(
    `/api/admin/referee-access?tournamentId=${encodeURIComponent(tournamentId)}`,
  );

export const saveRefereeInvite = (tournamentId: string, quota: number, rotate: boolean) =>
  railwayApi<{ ok: true; quota: number; joinPath: string | null }>("/api/admin/referee-invite", {
    method: "POST",
    body: JSON.stringify({ tournamentId, quota, rotate }),
  });

export const decideReferee = (refereeId: string, decision: RefereeStatus) =>
  railwayApi<{ ok: true }>("/api/admin/referee-decide", {
    method: "POST",
    body: JSON.stringify({ refereeId, decision }),
  });

export async function requestReferee(code: string, inviteToken: string, displayName: string) {
  return railwayApi<{ ok: true; status: "pending" }>("/api/tournaments", {
    method: "POST",
    body: JSON.stringify({
      action: "request-referee",
      code,
      token: inviteToken,
      displayName,
    }),
  });
}

export interface RefereeClaim {
  id: string;
  display_name: string;
  status: RefereeStatus;
  tournament_id: string;
  code: string;
  name: string;
}

export async function loadRefereeClaim() {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("SESSION_FAILED");
  const body = (await response.json()) as { refereeClaim?: RefereeClaim | null };
  return body.refereeClaim ?? null;
}
