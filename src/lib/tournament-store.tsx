import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { supabase } from "@/integrations/supabase/client";
import { bootstrapSuperadminFn, getMyRoleFn } from "./admin.functions";
import {
  createTournament,
  fetchTournamentByCode,
  finishTournament,
  publishLiveState,
  type TournamentResults,
  type TournamentRow,
} from "./tournaments";
import { computeTop4 } from "./standings";
import { displayAccount, toLoginEmail } from "./account-id";
import { RECONNECT_EVENT } from "@/hooks/use-connection";

const ACTIVE_KEY = "beyx-active-tournament";
const STATE_KEY = "beyx-live-state";

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

function buildBracket(players: Player[]): Match[] {
  if (players.length < 2) return [];
  const order = shuffle(players);
  let size = 2;
  while (size < order.length) size *= 2;
  const slots: (string | null)[] = Array.from({ length: size }, (_, i) => order[i]?.id ?? null);

  const rounds: Match[][] = [];
  const roundCount = Math.log2(size);

  for (let r = 0; r < roundCount; r++) {
    const count = size / 2 ** (r + 1);
    const round: Match[] = [];
    for (let i = 0; i < count; i++) {
      round.push({
        id: uid(),
        round: r,
        index: i,
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
      });
    }
    rounds.push(round);
  }

  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((m, i) => {
      m.nextMatchId = rounds[r + 1][Math.floor(i / 2)].id;
      m.nextSlot = i % 2 === 0 ? 1 : 2;
    });
  }

  rounds[0].forEach((m, i) => {
    m.p1 = slots[i * 2];
    m.p2 = slots[i * 2 + 1];
  });

  const all = rounds.flat();
  // resolve byes
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of all) {
      if (m.status === "done") continue;
      const solo = m.p1 && !m.p2 ? m.p1 : !m.p1 && m.p2 ? m.p2 : null;
      if (solo) {
        m.status = "done";
        m.winner = solo;
        if (m.nextMatchId) {
          const nm = all.find((x) => x.id === m.nextMatchId)!;
          if (m.nextSlot === 1) nm.p1 = solo;
          else nm.p2 = solo;
        }
        changed = true;
      }
    }
  }
  for (const m of all) {
    if (m.status !== "done" && m.p1 && m.p2) m.status = "ready";
  }
  return all;
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
  resetTournament: () => void;
  loadSample: () => void;
  currentTournament: TournamentRow | null;
  startNewTournament: (name: string) => Promise<string | null>;
  results: TournamentResults | null;
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

  // Spectator mode: follow the published bracket of the scanned tournament,
  // live via realtime and with polling + reconnect refresh as a safety net.
  useEffect(() => {
    if (!spectatorCode) return;
    let alive = true;
    const pull = async () => {
      const row = await fetchTournamentByCode(spectatorCode).catch(() => null);
      if (!alive || !row) return;
      setCurrentTournament(row);
      const live = row.live_state;
      if (live) {
        setPlayers((live.players ?? []) as Player[]);
        setMatches((live.matches ?? []) as Match[]);
        if (typeof live.tableCount === "number") setTableCount(live.tableCount);
      }
    };
    void pull();
    const timer = setInterval(pull, 5000);
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
        () => void pull(),
      )
      .subscribe();
    const onBack = () => void pull();
    if (typeof window !== "undefined") window.addEventListener(RECONNECT_EVENT, onBack);
    return () => {
      alive = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
      if (typeof window !== "undefined") window.removeEventListener(RECONNECT_EVENT, onBack);
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
      if (r === "admin" && !currentAdmin) return;
      setRoleState(r);
    },
    [currentAdmin],
  );

  const signIn = useCallback(
    async (account: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: toLoginEmail(account),
        password,
      });
      if (error) return "帳號或密碼錯誤";
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
  }, []);



  const addPlayers = useCallback((names: string[]) => {
    const clean = names.map((n) => n.trim()).filter(Boolean);
    if (!clean.length) return;
    setPlayers((prev) => [
      ...prev,
      ...clean.map((name, i) => ({ id: uid(), name, seed: prev.length + i + 1 })),
    ]);
  }, []);

  const removePlayer = useCallback((id: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id).map((p, i) => ({ ...p, seed: i + 1 })));
  }, []);

  const generateBracket = useCallback(() => {
    setMatches(buildBracket(players));
  }, [players]);

  const startMatch = useCallback((matchId: string, table: number) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, status: "live", table } : m)),
    );
  }, []);

  const addScore = useCallback(
    (matchId: string, slot: 1 | 2, type: FinishType, points: number) => {
      setMatches((prev) =>
        prev.map((m) => {
          if (m.id !== matchId) return m;
          return {
            ...m,
            score1: slot === 1 ? m.score1 + points : m.score1,
            score2: slot === 2 ? m.score2 + points : m.score2,
            events: [...m.events, { slot, type, points }],
          };
        }),
      );
    },
    [],
  );

  const undoScore = useCallback((matchId: string) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId || !m.events.length) return m;
        const events = [...m.events];
        const last = events.pop()!;
        return {
          ...m,
          events,
          score1: last.slot === 1 ? m.score1 - last.points : m.score1,
          score2: last.slot === 2 ? m.score2 - last.points : m.score2,
        };
      }),
    );
  }, []);

  const confirmWinner = useCallback((matchId: string) => {
    setMatches((prev) => {
      const next = prev.map((m) => ({ ...m }));
      const m = next.find((x) => x.id === matchId);
      if (!m) return prev;
      const winner = m.score1 >= WIN_TARGET ? m.p1 : m.score2 >= WIN_TARGET ? m.p2 : null;
      if (!winner) return prev;
      m.winner = winner;
      m.status = "done";
      m.table = null;
      if (m.nextMatchId) {
        const nm = next.find((x) => x.id === m.nextMatchId)!;
        if (m.nextSlot === 1) nm.p1 = winner;
        else nm.p2 = winner;
        if (nm.p1 && nm.p2 && nm.status === "waiting") nm.status = "ready";
      }
      return next;
    });
  }, []);

  const resetTournament = useCallback(() => {
    setPlayers([]);
    setMatches([]);
    setCurrentTournament(null);
  }, []);

  const loadSample = useCallback(() => {
    setMatches([]);
    setPlayers(SAMPLE_NAMES.map((name, i) => ({ id: uid(), name, seed: i + 1 })));
  }, []);

  const startNewTournament = useCallback(async (name: string) => {
    const clean = name.trim();
    if (!clean) return "請輸入賽事名稱";
    try {
      const row = await createTournament(clean);
      setCurrentTournament(row);
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, row.code);
      setPlayers([]);
      setMatches([]);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "建立賽事失敗";
    }
  }, []);

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


  // Admins publish the bracket so QR spectators can follow the event live.
  useEffect(() => {
    if (spectator || !hydrated || role !== "admin" || !currentTournament) return;
    if (!matches.length) return;
    const timer = setTimeout(() => {
      void publishLiveState(currentTournament.id, { players, matches, tableCount });
    }, 800);
    return () => clearTimeout(timer);
  }, [spectator, hydrated, role, currentTournament, players, matches, tableCount]);

  const results = useMemo(() => computeTop4(matches, players), [matches, players]);

  // Once the final is decided, archive the podium so the results page exists.
  useEffect(() => {
    if (spectator || !results || !currentTournament || currentTournament.status !== "open") return;
    let alive = true;
    finishTournament(currentTournament.id, results)
      .then((row) => alive && setCurrentTournament(row))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [spectator, results, currentTournament]);


  const playerName = useCallback(
    (id: string | null) => (id ? (players.find((p) => p.id === id)?.name ?? "—") : "待定 TBD"),
    [players],
  );

  const totalRounds = useMemo(
    () => (matches.length ? Math.max(...matches.map((m) => m.round)) + 1 : 0),
    [matches],
  );

  const roundName = useCallback(
    (round: number) => {
      const left = totalRounds - round;
      if (left === 1) return "決賽 FINAL";
      if (left === 2) return "四強 SEMI";
      if (left === 3) return "八強 QUARTER";
      return `第 ${round + 1} 輪 R${round + 1}`;
    },
    [totalRounds],
  );

  const value: Ctx = {
    players,
    currentTournament,
    startNewTournament,
    results,

    matches,
    tableCount,
    role,
    currentAdmin,
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
