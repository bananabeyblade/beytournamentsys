import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  WIN_TARGET,
  type AdminAccount,
  type FinishType,
  type Match,
  type Player,
  type Role,
  type TournamentState,
} from "./tournament-types";
import { SAMPLE_NAMES } from "./sample-names";

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
  currentAdmin: AdminAccount | null;
  setRole: (r: Role) => void;
  login: (u: string, p: string) => boolean;
  logout: () => void;
  addAdmin: (u: string, p: string) => string | null;
  removeAdmin: (id: string) => void;
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
  playerName: (id: string | null) => string;
  roundName: (round: number) => string;
}

const TournamentContext = createContext<Ctx | null>(null);

const DEFAULT_ADMINS: AdminAccount[] = [
  { id: "super", username: "superadmin", password: "beyx2024", isSuper: true },
];

export function TournamentProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tableCount, setTableCount] = useState(2);
  const [admins, setAdmins] = useState<AdminAccount[]>(DEFAULT_ADMINS);
  const [role, setRoleState] = useState<Role>("player");
  const [currentAdmin, setCurrentAdmin] = useState<AdminAccount | null>(null);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    if (r === "player") setCurrentAdmin(null);
  }, []);

  const login = useCallback(
    (u: string, p: string) => {
      const found = admins.find((a) => a.username === u.trim() && a.password === p);
      if (!found) return false;
      setCurrentAdmin(found);
      setRoleState("admin");
      return true;
    },
    [admins],
  );

  const logout = useCallback(() => {
    setCurrentAdmin(null);
    setRoleState("player");
  }, []);

  const addAdmin = useCallback(
    (u: string, p: string) => {
      const username = u.trim();
      if (!username || !p) return "帳號與密碼不可為空";
      if (admins.some((a) => a.username === username)) return "帳號已存在";
      setAdmins((prev) => [...prev, { id: uid(), username, password: p, isSuper: false }]);
      return null;
    },
    [admins],
  );

  const removeAdmin = useCallback((id: string) => {
    setAdmins((prev) => prev.filter((a) => a.id !== id || a.isSuper));
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
  }, []);

  const loadSample = useCallback(() => {
    setMatches([]);
    setPlayers(SAMPLE_NAMES.map((name, i) => ({ id: uid(), name, seed: i + 1 })));
  }, []);

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
    matches,
    tableCount,
    admins,
    role,
    currentAdmin,
    setRole,
    login,
    logout,
    addAdmin,
    removeAdmin,
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
