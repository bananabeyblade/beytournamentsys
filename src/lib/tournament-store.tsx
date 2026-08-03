import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  WIN_TARGET,
  type CloudAdmin,
  type FinishType,
  type Match,
  type Player,
  type Role,
  type TournamentState,
} from "./tournament-types";
import { SAMPLE_NAMES } from "./sample-names";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapSuperadminFn, getMyRoleFn } from "./admin.functions";
import {
  createTournament,
  fetchTournamentByCode,
  fetchLatestOpenTournament,
  finishTournament,
  publishLiveState,
  type TournamentResults,
  type TournamentRow,
} from "./tournaments";
import { computeTop4 } from "./standings";
import { LOCK_TTL_MS, activeLock, mergeMatches, mergePlayers, touchMatch } from "./live-merge";
import { displayAccount, isOwnerEmail, toLoginEmail } from "./account-id";
import { isUsernameAccount, padAdminPassword } from "./admin-password";
import { logAction, type AuditAction } from "./audit";
import { RECONNECT_EVENT } from "@/hooks/use-connection";

const ACTIVE_KEY = "beyx-active-tournament";
const STATE_KEY = "beyx-live-state";

/** Realtime carries the updates; polling is only a slow safety net. */
const SLOW_POLL_MS = 25000;
/** Coalescing window for rapid scoring taps (first write goes out at once). */
const PUBLISH_TAIL_MS = 250;
/** A held lock is only re-written (and re-synced) once it is this old. */
const LOCK_RENEW_AFTER_MS = Math.round(LOCK_TTL_MS * 0.6);


/** Cloud sync state of the live bracket, surfaced to admins as a badge. */
export type SyncStatus = "idle" | "syncing" | "synced" | "error";

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

interface PersistedState {
  players: Player[];
  matches: Match[];
  tableCount: number;
}

function readPersisted(): PersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) return null;
    return parsed;
  } catch {
    return null;
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Bit-reversal permutation of 0..count-1 — the standard seed-spread order. */
function seedOrder(count: number): number[] {
  const bits = Math.max(0, Math.round(Math.log2(Math.max(1, count))));
  return Array.from({ length: count }, (_, i) => {
    let rev = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) rev |= 1 << (bits - 1 - b);
    return { i, rev };
  })
    .sort((a, b) => a.rev - b.rev)
    .map((x) => x.i);
}

const blankMatch = (round: number, index: number): Match => ({
  id: uid(),
  round,
  index,
  p1: null,
  p2: null,
  score1: 0,
  score2: 0,
  status: "waiting",
  table: null,
  winner: null,
  events: [],
  nextMatchId: null,
  nextSlot: null,
  kind: "main",
  loserNextMatchId: null,
  loserNextSlot: null,
});

/**
 * Builds a full power-of-two main draw plus a preliminary ("預賽") round for the
 * surplus players, so odd entry counts never produce empty bye cards.
 */
function buildBracket(players: Player[]): Match[] {
  if (players.length < 2) return [];
  const order = shuffle(players);
  const n = order.length;
  // Largest power of two that fits — everyone above it plays a prelim bout.
  let main = 1;
  while (main * 2 <= n) main *= 2;
  const playIn = n - main;
  const hasPrelim = playIn > 0;
  const offset = hasPrelim ? 1 : 0;

  // Main draw rounds (index 0 = first main round, `main / 2` bouts).
  const rounds: Match[][] = [];
  for (let r = 0; r < Math.log2(main); r++) {
    const count = main / 2 ** (r + 1);
    rounds.push(Array.from({ length: count }, (_, i) => blankMatch(r + offset, i)));
  }
  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((m, i) => {
      m.nextMatchId = rounds[r + 1][Math.floor(i / 2)].id;
      m.nextSlot = i % 2 === 0 ? 1 : 2;
    });
  }

  const first = rounds[0];
  // Seats reserved for prelim winners, spread evenly across both halves.
  const spread = seedOrder(first.length);
  const seats: { match: Match; slot: 1 | 2 }[] = [];
  for (const slot of [1, 2] as const)
    for (const i of spread) seats.push({ match: first[i], slot });
  const reserved = seats.slice(0, playIn);

  const prelim: Match[] = reserved.map((seat, i) => {
    const m = blankMatch(0, i);
    m.nextMatchId = seat.match.id;
    m.nextSlot = seat.slot;
    return m;
  });

  // Players: prelim bouts first (two each), then the direct entrants.
  let next = 0;
  for (const m of prelim) {
    m.p1 = order[next++]?.id ?? null;
    m.p2 = order[next++]?.id ?? null;
    m.status = m.p1 && m.p2 ? "ready" : "waiting";
  }
  const reservedKey = new Set(reserved.map((s) => `${s.match.id}:${s.slot}`));
  for (const i of spread) {
    const m = first[i];
    for (const slot of [1, 2] as const) {
      if (reservedKey.has(`${m.id}:${slot}`)) continue;
      const pid = order[next++]?.id ?? null;
      if (slot === 1) m.p1 = pid;
      else m.p2 = pid;
    }
  }
  for (const m of first) if (m.p1 && m.p2) m.status = "ready";

  // Bronze match: the two semi-final losers meet to settle 3rd / 4th place.
  const third: Match[] = [];
  if (rounds.length >= 2) {
    const semis = rounds[rounds.length - 2];
    const finalRound = rounds[rounds.length - 1][0].round;
    const bronze = blankMatch(finalRound, 1);
    bronze.kind = "third";
    third.push(bronze);
    semis.forEach((m, i) => {
      m.loserNextMatchId = bronze.id;
      m.loserNextSlot = i === 0 ? 1 : 2;
    });
  }

  return [...(hasPrelim ? prelim : []), ...rounds.flat(), ...third];
}



interface Ctx extends TournamentState {
  role: Role;
  currentAdmin: CloudAdmin | null;
  authReady: boolean;
  setRole: (r: Role) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  claimSuperadmin: () => Promise<string | null>;
  refreshRole: () => Promise<void>;
  logout: () => Promise<void>;
  addPlayers: (names: string[]) => void;
  removePlayer: (id: string) => void;
  setTableCount: (n: number) => void;
  generateBracket: () => void;
  startMatch: (matchId: string, table: number) => void;
  addScore: (matchId: string, slot: 1 | 2, type: FinishType, points: number) => void;
  undoScore: (matchId: string) => void;
  confirmWinner: (matchId: string) => void;
  /** True when another device edited this bout moments ago (shared scoring). */
  scoringElsewhere: (match: Match) => boolean;
  /** Edit lock for a bout: who is scoring it right now (null when free). */
  lockInfo: (match: Match) => { by: string; name: string; at: number } | null;
  /** Takes the scoring lock. False when another referee already holds it. */
  acquireMatchLock: (matchId: string) => boolean;
  /** Heartbeat while the scoring sheet stays open. */
  renewMatchLock: (matchId: string) => void;
  releaseMatchLock: (matchId: string) => void;
  /** Owner-only escape hatch: steal a stuck lock. */
  forceUnlockMatch: (matchId: string) => void;
  /** Cloud sync state of the live bracket. */
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;
  retrySync: () => void;
  /** True for the platform owner account (john410403123@gmail.com). */
  isOwner: boolean;
  resetTournament: () => void;
  loadSample: () => void;
  currentTournament: TournamentRow | null;
  startNewTournament: (name: string) => Promise<string | null>;
  resumeTournament: (code: string) => Promise<string | null>;
  forceFinishTournament: () => Promise<string | null>;
  results: TournamentResults | null;
  /** True once the event is archived — scoring and starting bouts are frozen. */
  locked: boolean;
  spectator: boolean;

  playerName: (id: string | null) => string;
  roundName: (round: number) => string;
}

const TournamentContext = createContext<Ctx | null>(null);

export function TournamentProvider({
  children,
  spectatorCode,
}: {
  children: ReactNode;
  /** When set, the provider mirrors a cloud tournament read-only (QR viewers). */
  spectatorCode?: string;
}) {
  const spectator = !!spectatorCode;
  const [players, setPlayers] = useState<Player[]>([]);
  /** Player ids deleted on this device (id → epoch millis) — merge tombstones. */
  const removedPlayers = useRef<Record<string, number>>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [tableCount, setTableCount] = useState(2);
  const [currentTournament, setCurrentTournament] = useState<TournamentRow | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore the in-progress bracket so leaving the page (e.g. viewing past
  // results) and coming back does not wipe the live tournament.
  useEffect(() => {
    if (spectator) {
      setHydrated(true);
      return;
    }
    const saved = readPersisted();
    if (saved) {
      setPlayers(saved.players);
      setMatches(saved.matches);
      if (typeof saved.tableCount === "number") setTableCount(saved.tableCount);
    }
    setHydrated(true);
  }, [spectator]);

  useEffect(() => {
    if (!hydrated || spectator || typeof window === "undefined") return;
    localStorage.setItem(STATE_KEY, JSON.stringify({ players, matches, tableCount }));
  }, [hydrated, spectator, players, matches, tableCount]);

  // Spectator mode: follow the published bracket of the scanned tournament.
  // Realtime pushes the new row directly (no extra fetch); polling is only a
  // slow safety net and pauses while the tab is hidden.
  useEffect(() => {
    if (!spectatorCode) return;
    let alive = true;
    let lastStamp = "";

    const apply = (row: TournamentRow) => {
      if (!alive || !row) return;
      // Skip re-rendering the whole bracket when nothing actually changed.
      const stamp = `${row.status}|${row.live_updated_at ?? ""}`;
      if (stamp === lastStamp) return;
      lastStamp = stamp;
      setCurrentTournament(row);
      const live = row.live_state;
      if (live) {
        setPlayers((live.players ?? []) as Player[]);
        setMatches((live.matches ?? []) as Match[]);
        if (typeof live.tableCount === "number") setTableCount(live.tableCount);
      }
    };

    const pull = async () => {
      const row = await fetchTournamentByCode(spectatorCode).catch(() => null);
      if (row) apply(row);
    };

    void pull();

    // Slow compensation poll — only while the tab is actually visible.
    let timer: ReturnType<typeof setInterval> | undefined;
    const startTimer = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (isVisible()) void pull();
      }, SLOW_POLL_MS);
    };
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    startTimer();

    const channel = supabase
      .channel(`tournament-${spectatorCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournaments",
          filter: `code=eq.${spectatorCode}`,
        },
        (payload) => {
          const row = payload.new as TournamentRow | undefined;
          // Use the pushed row when it is complete; otherwise fall back.
          if (row && row.id && "live_updated_at" in row) apply(row);
          else void pull();
        },
      )
      .subscribe();

    const onBack = () => void pull();
    const onVisible = () => {
      if (isVisible()) {
        startTimer();
        void pull();
      } else {
        stopTimer();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener(RECONNECT_EVENT, onBack);
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      alive = false;
      stopTimer();
      supabase.removeChannel(channel);
      if (typeof window !== "undefined") {
        window.removeEventListener(RECONNECT_EVENT, onBack);
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [spectatorCode]);

  const [role, setRoleState] = useState<Role>("player");
  const [currentAdmin, setCurrentAdmin] = useState<CloudAdmin | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const syncRole = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      setCurrentAdmin(null);
      setRoleState("player");
      return;
    }
    try {
      const { role: cloudRole } = await getMyRoleFn();
      if (!cloudRole) {
        setCurrentAdmin(null);
        setRoleState("player");
        return;
      }
      setCurrentAdmin({
        id: user.id,
        email: displayAccount(user.email),
        isSuper: cloudRole === "superadmin",
      });
      setRoleState("admin");
    } catch {
      setCurrentAdmin(null);
      setRoleState("player");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void syncRole().finally(() => alive && setAuthReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void syncRole();
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [syncRole]);

  const setRole = useCallback(
    (r: Role) => {
      // Spectator (QR) sessions are strictly view-only — never allow admin UI.
      if (r === "admin" && (!currentAdmin || spectator)) return;
      setRoleState(r);
    },
    [currentAdmin, spectator],
  );

  const signIn = useCallback(
    async (account: string, password: string) => {
      const email = toLoginEmail(account);
      const attempts = isUsernameAccount(account)
        ? [padAdminPassword(password), password]
        : [password];
      let failed = true;
      for (const pw of attempts) {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (!error) {
          failed = false;
          break;
        }
      }
      if (failed) return "帳號或密碼錯誤";
      await syncRole();
      return null;
    },
    [syncRole],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return error.message;
      await supabase.auth.signInWithPassword({ email: email.trim(), password });
      await syncRole();
      return null;
    },
    [syncRole],
  );

  const claimSuperadmin = useCallback(async () => {
    try {
      await bootstrapSuperadminFn();
      await syncRole();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "設定失敗";
    }
  }, [syncRole]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setCurrentAdmin(null);
    setRoleState("player");
    // Wipe every trace of the event on this device: the next admin to sign in
    // here must not inherit (or republish) the previous admin's roster.
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_KEY);
      localStorage.removeItem(STATE_KEY);
    }
    followedId.current = "";
    abandonedId.current = "";
    removedPlayers.current = {};
    lastPayload.current = "";
    lastPublishedStamp.current = "";
    lastAppliedStamp.current = "";
    playersRef.current = [];
    matchesRef.current = [];
    setPlayers([]);
    setMatches([]);
    setCurrentTournament(null);
  }, []);



  // Audit trail: every roster/bracket/scoring change is recorded with the
  // acting account so the owner can trace who changed what, and when.
  const auditRef = useRef<{ admin: CloudAdmin | null; tour: TournamentRow | null }>({
    admin: null,
    tour: null,
  });
  auditRef.current = { admin: currentAdmin, tour: currentTournament };

  const log = useCallback((action: AuditAction, detail?: Record<string, unknown>) => {
    const { admin, tour } = auditRef.current;
    if (!admin) return;
    logAction({
      actorUserId: admin.id,
      actorEmail: admin.email,
      action,
      detail,
      tournamentId: tour?.id ?? null,
      tournamentName: tour?.name ?? null,
    });
  }, []);

  /** "A vs B" label for audit details. */
  const matchupOf = useCallback((m: Match) => {
    const nameOf = (id: string | null) =>
      id ? (playersRef.current.find((p) => p.id === id)?.name ?? "—") : "待定";
    return `${nameOf(m.p1)} vs ${nameOf(m.p2)}`;
  }, []);

  const addPlayers = useCallback(
    (names: string[]) => {
      const clean = names.map((n) => n.trim()).filter(Boolean);
      if (!clean.length) return;
      setPlayers((prev) => [
        ...prev,
        ...clean.map((name, i) => ({ id: uid(), name, seed: prev.length + i + 1 })),
      ]);
      log("player_add", { names: clean, count: clean.length });
    },
    [log],
  );

  const removePlayer = useCallback(
    (id: string) => {
      // Tombstone the id so an older cloud snapshot can't resurrect the player.
      removedPlayers.current[id] = Date.now();
      const gone = playersRef.current.find((p) => p.id === id)?.name;
      setPlayers((prev) => prev.filter((p) => p.id !== id).map((p, i) => ({ ...p, seed: i + 1 })));
      log("player_remove", { name: gone ?? id });
    },
    [log],
  );

  const generateBracket = useCallback(() => {
    setMatches(buildBracket(players));
    log("bracket_generate", { count: players.length });
  }, [players, log]);

  /** Remembers which bouts this device edited, to spot another referee's edits. */
  const localTouch = useRef<Record<string, number>>({});
  const markLocal = (matchId: string) => {
    localTouch.current[matchId] = Date.now();
  };

  // ---- Per-match edit lock (optimistic: rides on the match revision) --------

  const lockInfo = useCallback((match: Match) => activeLock(match), []);

  /** Applies a lock mutation to one match, bumping its revision so it syncs. */
  const setLock = useCallback(
    (matchId: string, lock: { by: string; name: string } | null) => {
      markLocal(matchId);
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId
            ? touchMatch({
                ...m,
                lockedBy: lock ? lock.by : null,
                lockedByName: lock ? lock.name : null,
                lockedAt: lock ? Date.now() : null,
              })
            : m,
        ),
      );
    },
    [],
  );

  const acquireMatchLock = useCallback(
    (matchId: string) => {
      const admin = auditRef.current.admin;
      if (!admin) return false;
      const m = matchesRef.current.find((x) => x.id === matchId);
      if (!m) return false;
      const held = activeLock(m);
      if (held && held.by !== admin.id) return false;
      setLock(matchId, { by: admin.id, name: admin.email });
      return true;
    },
    [setLock],
  );

  // Heartbeat: only writes (and therefore syncs) when the lock is close to
  // expiring, so an open scoring sheet doesn't republish the whole event
  // every 10 seconds — which also inflated `rev` and made other referees
  // see a false "someone else is scoring" warning.
  const renewMatchLock = useCallback(
    (matchId: string) => {
      const admin = auditRef.current.admin;
      if (!admin) return;
      const m = matchesRef.current.find((x) => x.id === matchId);
      if (!m) return;
      const held = activeLock(m);
      if (held && held.by !== admin.id) return;
      if (held && held.by === admin.id && Date.now() - held.at < LOCK_RENEW_AFTER_MS) return;
      setLock(matchId, { by: admin.id, name: admin.email });
    },
    [setLock],
  );

  const releaseMatchLock = useCallback(
    (matchId: string) => {
      const admin = auditRef.current.admin;
      const m = matchesRef.current.find((x) => x.id === matchId);
      if (!m || !m.lockedBy) return;
      // A decided bout already dropped its lock — don't bump its revision again.
      if (m.status === "done") return;
      if (admin && m.lockedBy !== admin.id) return;
      setLock(matchId, null);
    },
    [setLock],
  );


  const forceUnlockMatch = useCallback(
    (matchId: string) => {
      if (!isOwnerEmail(auditRef.current.admin?.email)) return;
      const m = matchesRef.current.find((x) => x.id === matchId);
      setLock(matchId, null);
      if (m) log("match_lock_force", { matchup: matchupOf(m), name: m.lockedByName ?? "" });
    },
    [setLock, log, matchupOf],
  );

  const startMatch = useCallback(
    (matchId: string, table: number) => {
      markLocal(matchId);
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? touchMatch({ ...m, status: "live", table }) : m)),
      );
      const m = matchesRef.current.find((x) => x.id === matchId);
      log("match_start", { matchup: m ? matchupOf(m) : matchId, table });
    },
    [log, matchupOf],
  );

  const addScore = useCallback(
    (matchId: string, slot: 1 | 2, type: FinishType, points: number) => {
      markLocal(matchId);
      let logged: { matchup: string; score: string } | null = null;
      setMatches((prev) =>
        prev.map((m) => {
          if (m.id !== matchId) return m;
          const next = touchMatch({
            ...m,
            score1: slot === 1 ? m.score1 + points : m.score1,
            score2: slot === 2 ? m.score2 + points : m.score2,
            events: [...m.events, { slot, type, points }],
          });
          logged = { matchup: matchupOf(m), score: `${next.score1} : ${next.score2}` };
          return next;
        }),
      );
      log("score_add", {
        ...(logged ?? { matchup: matchId }),
        finish: `選手 ${slot} +${points} (${type})`,
      });
    },
    [log, matchupOf],
  );

  const undoScore = useCallback(
    (matchId: string) => {
      markLocal(matchId);
      let logged: { matchup: string; score: string } | null = null;
      setMatches((prev) =>
        prev.map((m) => {
          if (m.id !== matchId || !m.events.length) return m;
          const events = [...m.events];
          const last = events.pop()!;
          const next = touchMatch({
            ...m,
            events,
            score1: last.slot === 1 ? m.score1 - last.points : m.score1,
            score2: last.slot === 2 ? m.score2 - last.points : m.score2,
          });
          logged = { matchup: matchupOf(m), score: `${next.score1} : ${next.score2}` };
          return next;
        }),
      );
      if (logged) log("score_undo", logged);
    },
    [log, matchupOf],
  );

  const confirmWinner = useCallback(
    (matchId: string) => {
      markLocal(matchId);
      let logged: { matchup: string; winner: string } | null = null;
      setMatches((prev) => {
        const next = prev.map((m) => ({ ...m }));
        const m = next.find((x) => x.id === matchId);
        if (!m) return prev;
        const winner = m.score1 >= WIN_TARGET ? m.p1 : m.score2 >= WIN_TARGET ? m.p2 : null;
        if (!winner) return prev;
        logged = {
          matchup: matchupOf(m),
          winner: playersRef.current.find((p) => p.id === winner)?.name ?? "—",
        };
        m.winner = winner;
        m.status = "done";
        m.table = null;
        // The bout is decided: drop the scoring lock with it.
        m.lockedBy = null;
        m.lockedByName = null;
        m.lockedAt = null;
        Object.assign(m, touchMatch(m));
        if (m.nextMatchId) {
          const nm = next.find((x) => x.id === m.nextMatchId)!;
          if (m.nextSlot === 1) nm.p1 = winner;
          else nm.p2 = winner;
          if (nm.p1 && nm.p2 && nm.status === "waiting") nm.status = "ready";
          markLocal(nm.id);
          Object.assign(nm, touchMatch(nm));
        }
        // A semi-final also feeds the bronze match with its loser.
        if (m.loserNextMatchId) {
          const bm = next.find((x) => x.id === m.loserNextMatchId);
          if (bm) {
            const loser = m.p1 === winner ? m.p2 : m.p1;
            if (m.loserNextSlot === 1) bm.p1 = loser;
            else bm.p2 = loser;
            if (bm.p1 && bm.p2 && bm.status === "waiting") bm.status = "ready";
            markLocal(bm.id);
            Object.assign(bm, touchMatch(bm));
          }
        }
        return next;
      });
      if (logged) log("match_confirm", logged);
    },
    [log, matchupOf],
  );

  const resetTournament = useCallback(() => {
    // Publish the cleared state first, otherwise the other admins and the
    // spectators keep mirroring the old roster / bracket forever.
    const active = currentTournament;
    if (active) {
      const stamp = new Date().toISOString();
      lastPayload.current = JSON.stringify({ players: [], matches: [], tableCount });
      lastPublishedStamp.current = stampOf(active.status, stamp);
      lastAppliedStamp.current = lastPublishedStamp.current;
      void publishLiveState(active.id, { players: [], matches: [], tableCount }, stamp).catch(() =>
        toast.error("同步失敗", { description: "清除結果尚未上傳，請確認網路。" }),
      );
    }
    log("tournament_reset", { count: playersRef.current.length });
    removedPlayers.current = {};
    // Forget the followed event too, otherwise the sync loop re-adopts the
    // same tournament (it is still "open" in the cloud) and it reappears.
    if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_KEY);
    followedId.current = "";
    if (active) abandonedId.current = active.id;
    playersRef.current = [];
    matchesRef.current = [];
    setPlayers([]);
    setMatches([]);
    setCurrentTournament(null);

  }, [currentTournament, tableCount, log]);


  const loadSample = useCallback(() => {
    setMatches([]);
    setPlayers(SAMPLE_NAMES.map((name, i) => ({ id: uid(), name, seed: i + 1 })));
  }, []);

  const startNewTournament = useCallback(
    async (name: string) => {
      const clean = name.trim();
      if (!clean) return "請輸入賽事名稱";
      try {
        const row = await createTournament(clean);
        setCurrentTournament(row);
        if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, row.code);
        removedPlayers.current = {};
        // Reset the echo guards so the fresh (empty) event is definitely
        // published once — otherwise other devices keep the old snapshot.
        followedId.current = row.id;
        abandonedId.current = "";
        lastPayload.current = "";
        lastPublishedStamp.current = "";
        lastAppliedStamp.current = "";
        playersRef.current = [];
        matchesRef.current = [];
        setPlayers([]);
        setMatches([]);

        const admin = auditRef.current.admin;
        if (admin) {
          logAction({
            actorUserId: admin.id,
            actorEmail: admin.email,
            action: "tournament_create",
            detail: { name: row.name },
            tournamentId: row.id,
            tournamentName: row.name,
          });
        }
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "建立賽事失敗";
      }
    },
    [],
  );

  /** Switch the admin view back to an existing (in-progress) tournament. */
  const resumeTournament = useCallback(async (code: string) => {
    try {
      const row = await fetchTournamentByCode(code);
      if (!row) return "找不到該賽事";
      setCurrentTournament(row);
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, row.code);
      // Switching events: previous event's delete tombstones no longer apply.
      removedPlayers.current = {};
      followedId.current = row.id;
      // Re-entering an event explicitly cancels the "abandoned" mark.
      if (abandonedId.current === row.id) abandonedId.current = "";
      const nextPlayers = (row.live_state?.players ?? []) as Player[];
      const nextMatches = (row.live_state?.matches ?? []) as Match[];
      const nextTables =
        typeof row.live_state?.tableCount === "number"
          ? row.live_state.tableCount
          : tableCountRef.current;
      lastPayload.current = JSON.stringify({
        players: nextPlayers,
        matches: nextMatches,
        tableCount: nextTables,
      });
      lastAppliedStamp.current = stampOf(row.status, row.live_updated_at);
      lastPublishedStamp.current = lastAppliedStamp.current;
      playersRef.current = nextPlayers;
      matchesRef.current = nextMatches;
      setPlayers(nextPlayers);
      setMatches(nextMatches);
      setTableCount(nextTables);

      return null;
    } catch {
      return "無法載入賽事";
    }
  }, []);

  /** Superadmin escape hatch: close the event even if the final isn't played. */
  const forceFinishTournament = useCallback(async () => {
    if (!currentTournament) return "目前沒有進行中的賽事";
    try {
      const snapshot = computeTop4(matches, players) ?? {
        top4: [],
        playerCount: players.length,
      };
      // Close every unfinished match so live boards stop showing active bouts.
      // A bout that was never played (no score events) is closed WITHOUT a
      // winner, so the podium never invents a result nobody competed for.
      const closed: Match[] = matches.map((m) => {
        if (m.status === "done") return m;
        const played = m.events.length > 0;
        const solo = m.p1 && m.p2 ? null : (m.p1 ?? m.p2);
        const leader = m.score1 === m.score2 ? null : m.score1 > m.score2 ? m.p1 : m.p2;
        return touchMatch({
          ...m,
          status: "done" as const,
          table: null,
          winner: m.winner ?? solo ?? (played ? leader : null),
        });
      });

      setMatches(closed);
      const row = await finishTournament(currentTournament.id, snapshot);
      setCurrentTournament(row);
      // Push the closed bracket immediately so spectators/other admins refresh.
      const stamp = new Date().toISOString();
      lastPublishedStamp.current = stampOf("finished", stamp);
      lastAppliedStamp.current = lastPublishedStamp.current;
      lastPayload.current = JSON.stringify({ players, matches: closed, tableCount });

      await publishLiveState(
        currentTournament.id,
        { players, matches: closed, tableCount },
        stamp,
      ).catch(() => undefined);
      log("tournament_force_finish", { count: players.length });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "結束賽事失敗";
    }
  }, [currentTournament, matches, players, tableCount, log]);

  // Restore the last created tournament so the QR card survives reloads.
  useEffect(() => {
    if (spectator) return;
    const code = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
    if (!code) return;
    let alive = true;
    fetchTournamentByCode(code)
      .then((row) => {
        if (alive && row) setCurrentTournament(row);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Every signed-in admin (not just the creator) follows the current event:
  // pick up the newest open tournament and mirror its published bracket.
  const lastPublishedStamp = useRef<string>("");
  const lastAppliedStamp = useRef<string>("");
  const followedId = useRef<string>("");
  /** Event cleared on this device — never auto-adopted again (only via 進入賽事). */
  const abandonedId = useRef<string>("");

  /** Serialized snapshot of the last state pushed/applied — blocks echo loops. */
  const lastPayload = useRef<string>("");
  /** When the last publish went out — powers the leading-edge write. */
  const lastPublishAt = useRef<number>(0);
  /** When we last applied a cloud snapshot — suppresses publish ping-pong. */
  const lastApplyAt = useRef<number>(0);
  /** Cloud sync indicator shown to admins (green / amber / red). */
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  /** Latest cloud pull, exposed so the retry button can force a re-read. */
  const pullRef = useRef<(() => Promise<void>) | null>(null);

  // Mirrors of the live state so the follow loop can merge (and record the
  // merged payload) synchronously, without waiting for a re-render.
  const playersRef = useRef<Player[]>(players);
  const matchesRef = useRef<Match[]>(matches);
  const tableCountRef = useRef<number>(tableCount);
  playersRef.current = players;
  matchesRef.current = matches;
  tableCountRef.current = tableCount;


  // Timestamps come back from Postgres as `+00:00` while we send `Z`; compare
  // them as epoch millis so a device never re-applies its own publish (which
  // used to bounce state forever between pull → publish → realtime → pull).
  const stampOf = (status: string, iso: string | null | undefined) =>
    `${status}|${iso ? Date.parse(iso) : ""}`;

  useEffect(() => {
    if (spectator || !hydrated || role !== "admin" || !currentAdmin) return;
    let alive = true;

    const apply = (row: TournamentRow) => {
      if (!alive || !row) return;
      // A tournament cleared on this device stays cleared until the admin
      // explicitly re-enters it from the history list.
      if (row.id === abandonedId.current) return;
      setCurrentTournament((prev) =>
        prev && prev.id === row.id && prev.status === row.status ? prev : row,
      );
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, row.code);
      // Only treat it as a switch once we've already followed another event —
      // never wipe local edits on the first pull after login.
      const switched = followedId.current !== "" && followedId.current !== row.id;
      followedId.current = row.id;
      const stamp = stampOf(row.status, row.live_updated_at);
      if (switched) {
        // Different event: drop everything from the previous one, otherwise its
        // roster gets merged into (and republished onto) this tournament.
        removedPlayers.current = {};
        playersRef.current = [];
        matchesRef.current = [];
        lastPayload.current = "";
        lastPublishedStamp.current = "";
        lastAppliedStamp.current = "";
        setPlayers([]);
        setMatches([]);
      }
      if (!row.live_state || !row.live_updated_at) return;

      if (stamp === lastPublishedStamp.current || stamp === lastAppliedStamp.current) return;
      lastAppliedStamp.current = stamp;


      const incoming = {
        players: (row.live_state.players ?? []) as Player[],
        matches: (row.live_state.matches ?? []) as Match[],
        tableCount:
          typeof row.live_state.tableCount === "number"
            ? row.live_state.tableCount
            : tableCountRef.current,

      };
      // Merge the roster by id so a player added here (or by the other admin a
      // moment ago) is never wiped by an older snapshot; deletions stay applied.
      const mergedPlayers = mergePlayers(
        playersRef.current,
        incoming.players,
        Object.keys(removedPlayers.current),
      );
      // Merge per match: another referee's tables come in, while a bout this
      // device just scored (higher rev) survives until its own push lands.
      const mergedMatches = mergeMatches(matchesRef.current, incoming.matches);

      // Record the MERGED result (not the raw snapshot) as the echo guard:
      // otherwise the publish effect reads the merge as a fresh local edit and
      // two admins bounce publishes off each other forever.
      const merged = JSON.stringify({
        players: mergedPlayers,
        matches: mergedMatches,
        tableCount: incoming.tableCount,
      });
      if (merged === lastPayload.current) return;
      lastPayload.current = merged;
      lastApplyAt.current = Date.now();

      playersRef.current = mergedPlayers;
      matchesRef.current = mergedMatches;
      setPlayers(mergedPlayers);
      setMatches(mergedMatches);
      setTableCount(incoming.tableCount);
    };

    const pull = async () => {
      let row = await fetchLatestOpenTournament().catch(() => null);
      if (!row) {
        // No open event: keep following the active one so a force-finish
        // (which closes the event) still propagates to every admin device.
        const code = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
        if (code) row = await fetchTournamentByCode(code).catch(() => null);
      }
      if (row) apply(row);
    };
    pullRef.current = pull;


    // Coalesce bursts of realtime events into at most one fetch per window.
    let pullTimer: ReturnType<typeof setTimeout> | undefined;
    const queuePull = () => {
      if (pullTimer) return;
      pullTimer = setTimeout(() => {
        pullTimer = undefined;
        void pull();
      }, 800);
    };

    void pull();

    let timer: ReturnType<typeof setInterval> | undefined;
    const startTimer = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (isVisible()) void pull();
      }, SLOW_POLL_MS);
    };
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    startTimer();

    const channel = supabase
      .channel("admin-tournament-follow")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, (payload) => {
        const row = payload.new as TournamentRow | undefined;
        // The pushed row is enough when it is the event we already follow.
        if (row && row.id && row.id === followedId.current && "live_updated_at" in row) {
          apply(row);
          return;
        }
        // Another (already closed) event changed — irrelevant to this device.
        if (row && row.id && followedId.current && row.id !== followedId.current) {
          if (row.status && row.status !== "open") return;
        }
        queuePull();
      })
      .subscribe();

    const onBack = () => void pull();
    const onVisible = () => {
      if (isVisible()) {
        startTimer();
        void pull();
      } else {
        stopTimer();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener(RECONNECT_EVENT, onBack);
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      alive = false;
      stopTimer();
      if (pullTimer) clearTimeout(pullTimer);
      supabase.removeChannel(channel);
      if (typeof window !== "undefined") {
        window.removeEventListener(RECONNECT_EVENT, onBack);
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [spectator, hydrated, role, currentAdmin]);

  // Admins publish players + bracket so spectators and the other admins follow
  // the same event state — the roster must sync before the bracket exists too.
  // First change goes out immediately; rapid follow-ups are tail-debounced.
  useEffect(() => {
    if (spectator || !hydrated || role !== "admin" || !currentTournament) return;
    // A closed event is read-only — never overwrite the archived snapshot.
    if (currentTournament.status !== "open") return;
    // Nothing actually changed locally → don't write (avoids write/echo storms).
    const payload = JSON.stringify({ players, matches, tableCount });
    if (payload === lastPayload.current) return;

    const push = () => {
      lastPayload.current = payload;
      lastPublishAt.current = Date.now();
      const stamp = new Date().toISOString();
      lastPublishedStamp.current = stampOf(currentTournament.status, stamp);
      lastAppliedStamp.current = lastPublishedStamp.current;
      setSyncStatus("syncing");
      publishLiveState(
        currentTournament.id,
        {
          players,
          matches,
          tableCount,
          // Send tombstones so the server-side roster merge drops them too.
          removedPlayers: Object.keys(removedPlayers.current),
        },
        stamp,
      )
        .then(() => {
          setSyncStatus("synced");
          setLastSyncedAt(Date.now());
        })
        .catch(() => {
          // Let the next change retry, and tell the referee the push failed.
          lastPayload.current = "";
          setSyncStatus("error");
          toast.error("同步失敗", { description: "分數尚未上傳，請確認網路後再試一次。" });
        });
    };


    const sinceLast = Date.now() - lastPublishAt.current;
    const sinceApply = Date.now() - lastApplyAt.current;
    // Right after applying a cloud snapshot, always take the debounced path so
    // several admins can't trade leading-edge publishes back and forth.
    const wait = Math.max(
      PUBLISH_TAIL_MS - sinceLast,
      sinceApply < PUBLISH_TAIL_MS ? PUBLISH_TAIL_MS - sinceApply : 0,
    );
    if (wait <= 0) {
      push();
      return;
    }
    const timer = setTimeout(push, wait);
    return () => clearTimeout(timer);
  }, [spectator, hydrated, role, currentTournament, players, matches, tableCount]);

  /** Re-sends the current bracket and re-pulls the cloud copy (badge retry). */
  const retrySync = useCallback(() => {
    const active = currentTournament;
    if (!active || active.status !== "open") {
      void pullRef.current?.();
      return;
    }
    setSyncStatus("syncing");
    const stamp = new Date().toISOString();
    lastPayload.current = JSON.stringify({ players, matches, tableCount });
    lastPublishAt.current = Date.now();
    lastPublishedStamp.current = stampOf(active.status, stamp);
    lastAppliedStamp.current = lastPublishedStamp.current;
    publishLiveState(
      active.id,
      { players, matches, tableCount, removedPlayers: Object.keys(removedPlayers.current) },
      stamp,
    )
      .then(() => {
        setSyncStatus("synced");
        setLastSyncedAt(Date.now());
        void pullRef.current?.();
      })
      .catch(() => {
        lastPayload.current = "";
        setSyncStatus("error");
        toast.error("同步失敗", { description: "請確認網路後再試一次。" });
      });
  }, [currentTournament, players, matches, tableCount]);



  const results = useMemo(() => computeTop4(matches, players), [matches, players]);

  /** Guards against every online admin archiving the same event at once. */
  const archivedId = useRef<string>("");

  // Once the final is decided, archive the podium so the results page exists.
  useEffect(() => {
    if (spectator || !results || !currentTournament || currentTournament.status !== "open") return;
    if (archivedId.current === currentTournament.id) return;
    archivedId.current = currentTournament.id;
    let alive = true;
    const code = currentTournament.code;
    finishTournament(currentTournament.id, results)
      .then((row) => alive && setCurrentTournament(row))
      .catch(async () => {
        // Another admin may have archived the same event a moment earlier —
        // adopt their row instead of retrying (and never toast for that case).
        const row = await fetchTournamentByCode(code).catch(() => null);
        if (row && row.status !== "open") {
          if (alive) setCurrentTournament(row);
          return;
        }
        archivedId.current = "";
        if (alive) toast.error("成績封存失敗", { description: "請確認網路後再試一次。" });
      });
    return () => {
      alive = false;
    };
  }, [spectator, results, currentTournament]);

  const scoringElsewhere = useCallback((match: Match) => {
    const edited = typeof match.updatedAt === "number" ? match.updatedAt : 0;
    if (!edited || Date.now() - edited > 20000) return false;
    const mine = localTouch.current[match.id] ?? 0;
    return edited - mine > 1500;
  }, []);

  const playerName = useCallback(
    (id: string | null) => (id ? (players.find((p) => p.id === id)?.name ?? "—") : "待定 TBD"),
    [players],
  );

  const totalRounds = useMemo(
    () => (matches.length ? Math.max(...matches.map((m) => m.round)) + 1 : 0),
    [matches],
  );

  /** True when round 0 is a preliminary round (fewer bouts than a full round). */
  const hasPrelim = useMemo(() => {
    if (totalRounds < 2) return false;
    const c0 = matches.filter((m) => m.round === 0).length;
    const c1 = matches.filter((m) => m.round === 1).length;
    return c0 !== c1 * 2;
  }, [matches, totalRounds]);

  const roundName = useCallback(
    (round: number) => {
      if (hasPrelim && round === 0) return "預賽 PRELIM";
      const left = totalRounds - round;
      if (left === 1) return "決賽 FINAL";
      if (left === 2) return "四強 SEMI";
      if (left === 3) return "八強 QUARTER";
      const n = hasPrelim ? round : round + 1;
      return `第 ${n} 輪 R${n}`;
    },
    [totalRounds, hasPrelim],
  );


  const value: Ctx = {
    players,
    currentTournament,
    startNewTournament,
    resumeTournament,
    forceFinishTournament,
    results,
    locked: !!currentTournament && currentTournament.status !== "open",

    matches,
    tableCount,
    role: spectator ? "player" : role,
    currentAdmin: spectator ? null : currentAdmin,

    authReady,
    setRole,
    signIn,
    signUp,
    claimSuperadmin,
    refreshRole: syncRole,
    logout,

    addPlayers,
    removePlayer,
    setTableCount,
    generateBracket,
    startMatch,
    addScore,
    undoScore,
    confirmWinner,
    scoringElsewhere,
    lockInfo,
    acquireMatchLock,
    renewMatchLock,
    releaseMatchLock,
    forceUnlockMatch,
    syncStatus,
    lastSyncedAt,
    retrySync,
    isOwner: !spectator && isOwnerEmail(currentAdmin?.email),
    resetTournament,
    loadSample,
    spectator,
    playerName,
    roundName,
  };

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
}

export function useTournament() {
  const ctx = useContext(TournamentContext);
  if (!ctx) throw new Error("useTournament must be used within TournamentProvider");
  return ctx;
}
