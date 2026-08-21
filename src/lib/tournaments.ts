import { supabase } from "@/integrations/supabase/client";
import { railwayApi, railwayAuthEnabled } from "./railway-api";

export interface Top4Entry {
  rank: number;
  name: string;
}

export interface TournamentResults {
  top4: Top4Entry[];
  playerCount: number;
}

export interface TournamentRow {
  id: string;
  code: string;
  name: string;
  status: "open" | "finished" | "archived";
  results: TournamentResults | null;
  created_at: string;
  finished_at: string | null;
  live_state: LiveState | null;
  live_updated_at: string | null;
  logo_url: string | null;
}

/** Snapshot of the running bracket, published so spectators can follow along. */
export interface LiveState {
  players: unknown[];
  matches: unknown[];
  tableCount: number;
  /** Ids of players deleted locally — applied as tombstones during the merge. */
  removedPlayers?: string[];
}

/**
 * Admin-only: pushes the current bracket so QR spectators can watch live.
 * The write goes through a database function that merges match-by-match, so
 * two referees scoring different tables at once never overwrite each other.
 */
export async function publishLiveState(id: string, state: LiveState, stamp?: string) {
  if (railwayAuthEnabled) {
    await railwayApi("/api/admin/publish", {
      method: "POST",
      body: JSON.stringify({ id, state, stamp }),
    });
    return;
  }
  const { error } = await supabase.rpc("publish_live_state", {
    _tournament_id: id,
    _state: JSON.parse(JSON.stringify(state)),
    _stamp: stamp ?? new Date().toISOString(),
  });
  // Surfaced to the referee as a toast — a silent failure loses live scores.
  if (error) throw new Error("同步賽況失敗");
}

/** Superadmin-only: deliberately clears an open event through a dedicated RPC. */
export async function resetTournamentLiveState(id: string, tableCount: number, stamp?: string) {
  if (railwayAuthEnabled) {
    await railwayApi("/api/admin/reset", {
      method: "POST",
      body: JSON.stringify({ id, tableCount, stamp }),
    });
    return;
  }
  const { error } = await supabase.rpc("reset_tournament_live_state", {
    _tournament_id: id,
    _table_count: tableCount,
    _stamp: stamp ?? new Date().toISOString(),
  });
  if (error) throw new Error("重置賽事同步失敗");
}

const COLS =
  "id,code,name,status,results,created_at,finished_at,live_state,live_updated_at,logo_url";

function makeCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

const LOGO_BUCKET = "tournament-logos";
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Admin-only: uploads a host-picked logo image and returns its public URL.
 * Called before `createTournament` so the URL can be saved on insert.
 */
export async function uploadTournamentLogo(file: File): Promise<string> {
  if (railwayAuthEnabled) {
    if (!file.type.startsWith("image/") || file.size > MAX_LOGO_BYTES)
      throw new Error("LOGO_INVALID");
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/admin/logo", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    const result = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error || "LOGO_UPLOAD_FAILED");
    return result.url;
  }
  if (!file.type.startsWith("image/")) throw new Error("logo 必須是圖片檔");
  if (file.size > MAX_LOGO_BYTES) throw new Error("logo 檔案不能超過 5MB");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("請先登入管理者帳號");
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${auth.user.id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("上傳 logo 失敗");
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Admin-only (enforced by row-level policies). Creates a fresh QR session. */
export async function createTournament(
  name: string,
  logoUrl?: string | null,
): Promise<TournamentRow> {
  if (railwayAuthEnabled) {
    const result = await railwayApi<{ tournament: TournamentRow }>("/api/admin/create-tournament", {
      method: "POST",
      body: JSON.stringify({ name, logoUrl }),
    });
    return result.tournament;
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("請先登入管理者帳號");
  const { data, error } = await supabase
    .from("tournaments")
    .insert({
      name: name.trim(),
      code: makeCode(),
      created_by: auth.user.id,
      logo_url: logoUrl?.trim() || null,
    })
    .select(COLS)
    .single();
  if (error) throw new Error("建立賽事失敗");
  return data as unknown as TournamentRow;
}

/** Admin-only: closes the tournament and stores the final top-4 board. */
export async function finishTournament(id: string, results: TournamentResults) {
  if (railwayAuthEnabled) {
    const result = await railwayApi<{ tournament: TournamentRow }>("/api/admin/finish", {
      method: "POST",
      body: JSON.stringify({ id, results }),
    });
    return result.tournament;
  }
  const { data, error } = await supabase
    .from("tournaments")
    .update({
      status: "finished",
      finished_at: new Date().toISOString(),
      results: JSON.parse(JSON.stringify(results)),
    })

    .eq("id", id)
    .select(COLS)
    .single();
  if (error) throw new Error("結束賽事失敗");
  return data as unknown as TournamentRow;
}

/** Public: used by the QR sign-up page and the results page. */
export async function fetchTournamentByCode(code: string): Promise<TournamentRow | null> {
  if (railwayAuthEnabled) {
    const result = await railwayApi<{ tournaments: TournamentRow[] }>(
      `/api/tournaments?code=${encodeURIComponent(code)}`,
    );
    return result.tournaments[0] ?? null;
  }
  const { data, error } = await supabase
    .from("tournaments")
    .select(COLS)
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) return null;
  return (data as unknown as TournamentRow) ?? null;
}

/** History list — visible to signed-in admins in the settings tab. */
export async function listTournaments(): Promise<TournamentRow[]> {
  if (railwayAuthEnabled) {
    return (await railwayApi<{ tournaments: TournamentRow[] }>("/api/admin/tournaments"))
      .tournaments;
  }
  const { data, error } = await supabase
    .from("tournaments")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("無法讀取賽事紀錄");
  return (data ?? []) as unknown as TournamentRow[];
}

/** Latest still-open tournament — lets any admin join the event in progress. */
export async function fetchLatestOpenTournament(): Promise<TournamentRow | null> {
  if (railwayAuthEnabled) {
    const result = await railwayApi<{ tournaments: TournamentRow[] }>(
      "/api/admin/tournaments?latest=open",
    );
    return result.tournaments[0] ?? null;
  }
  const { data, error } = await supabase
    .from("tournaments")
    .select(COLS)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as TournamentRow) ?? null;
}

/** Owner/developer-only. Archives an event so Deck/Combo history remains available. */
export async function deleteTournament(id: string) {
  if (railwayAuthEnabled) {
    await railwayApi("/api/admin/delete-tournament", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    return;
  }
  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) throw new Error("刪除賽事失敗（僅限開發者操作）");
}
