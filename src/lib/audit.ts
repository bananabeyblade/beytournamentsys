import { supabase } from "@/integrations/supabase/client";
import { railwayApi, railwayAuthEnabled } from "./railway-api";

/** Action kinds recorded in the admin audit trail. */
export type AuditAction =
  | "player_add"
  | "player_remove"
  | "bracket_generate"
  | "match_start"
  | "score_add"
  | "score_undo"
  | "match_confirm"
  | "match_lock_force"
  | "tournament_create"
  | "tournament_force_finish"
  | "tournament_reset";

export const AUDIT_LABELS: Record<AuditAction, string> = {
  player_add: "新增選手",
  player_remove: "刪除選手",
  bracket_generate: "產生賽程（建名單）",
  match_start: "開始比賽",
  score_add: "輸入比分",
  score_undo: "撤銷比分",
  match_confirm: "確認勝者",
  match_lock_force: "強制接手計分",
  tournament_create: "建立賽事",
  tournament_force_finish: "強制結束賽事",
  tournament_reset: "重置賽事",
};

export interface AuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  tournament_name: string | null;
  created_at: string;
}

export interface LogActionInput {
  actorUserId: string;
  actorEmail: string | null;
  action: AuditAction;
  detail?: Record<string, unknown>;
  tournamentId?: string | null;
  tournamentName?: string | null;
}

/**
 * Best-effort audit write. Row-level policies only allow an admin to record
 * their OWN actions, and nobody can read the table from the client — the owner
 * reads it through a server function instead.
 * Never throws: losing a log line must not interrupt scoring in the venue.
 */
export function logAction(input: LogActionInput): void {
  if (railwayAuthEnabled) {
    void railwayApi("/api/admin/record-audit", {
      method: "POST",
      body: JSON.stringify({
        action: input.action,
        detail: input.detail ?? {},
        tournamentId: input.tournamentId ?? null,
        tournamentName: input.tournamentName ?? null,
      }),
    }).catch((error) => console.warn("[audit] log failed", error));
    return;
  }
  void supabase
    .from("admin_actions")
    .insert({
      actor_user_id: input.actorUserId,
      actor_email: input.actorEmail,
      action: input.action,
      detail: (input.detail ?? {}) as never,
      tournament_id: input.tournamentId ?? null,
      tournament_name: input.tournamentName ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("[audit] log failed", error.message);
    });
}

/** Human-readable one-liner for the owner's audit panel and the .txt export. */
export function describeEntry(e: AuditEntry): string {
  const label = AUDIT_LABELS[e.action as AuditAction] ?? e.action;
  const d = (e.detail ?? {}) as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof d["name"] === "string") bits.push(String(d["name"]));
  if (Array.isArray(d["names"])) bits.push((d["names"] as unknown[]).join("、"));
  if (typeof d["count"] === "number") bits.push(`${d["count"]} 人`);
  if (typeof d["round"] === "string") bits.push(String(d["round"]));
  if (typeof d["table"] === "number") bits.push(`桌 ${d["table"]}`);
  if (typeof d["matchup"] === "string") bits.push(String(d["matchup"]));
  if (typeof d["finish"] === "string") bits.push(String(d["finish"]));
  if (typeof d["score"] === "string") bits.push(String(d["score"]));
  if (typeof d["winner"] === "string") bits.push(`勝者 ${d["winner"]}`);
  return bits.length ? `${label} · ${bits.join(" · ")}` : label;
}
