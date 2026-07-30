import { supabase } from "@/integrations/supabase/client";

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
  status: "open" | "finished";
  results: TournamentResults | null;
  created_at: string;
  finished_at: string | null;
  live_state: LiveState | null;
  live_updated_at: string | null;
}

/** Snapshot of the running bracket, published so spectators can follow along. */
export interface LiveState {
  players: unknown[];
  matches: unknown[];
  tableCount: number;
}

/** Admin-only: pushes the current bracket so QR spectators can watch live. */
export async function publishLiveState(id: string, state: LiveState, stamp?: string) {
  const { error } = await supabase
    .from("tournaments")
    .update({
      live_state: JSON.parse(JSON.stringify(state)),
      live_updated_at: stamp ?? new Date().toISOString(),
    })
    .eq("id", id);
  // Surfaced to the referee as a toast — a silent failure loses live scores.
  if (error) throw new Error("同步賽況失敗");
}

const COLS =
  "id,code,name,status,results,created_at,finished_at,live_state,live_updated_at";

function makeCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Admin-only (enforced by row-level policies). Creates a fresh QR session. */
export async function createTournament(name: string): Promise<TournamentRow> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("請先登入管理者帳號");
  const { data, error } = await supabase
    .from("tournaments")
    .insert({ name: name.trim(), code: makeCode(), created_by: auth.user.id })
    .select(COLS)
    .single();
  if (error) throw new Error("建立賽事失敗");
  return data as unknown as TournamentRow;
}

/** Admin-only: closes the tournament and stores the final top-4 board. */
export async function finishTournament(id: string, results: TournamentResults) {
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


/** Superadmin-only (enforced by row-level policies). Removes a tournament and its registrations. */
export async function deleteTournament(id: string) {
  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) throw new Error("刪除賽事失敗（需要總管理者權限）");
}
