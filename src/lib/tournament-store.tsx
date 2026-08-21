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
import { lovable } from "@/integrations/lovable";
import { bootstrapSuperadminFn, getMyRoleFn, promoteGoogleOwnerFn } from "./admin-client";
import {
  fetchRailwaySession,
  logoutRailway,
  railwayAuthEnabled,
  loginRailwayWithPassword,
  startRailwayGoogleLogin,
} from "./railway-auth";
import {
  createTournament,
  fetchTournamentByCode,
  fetchLatestOpenTournament,
  finishTournament,
  publishLiveState,
  resetTournamentLiveState,
  type TournamentResults,
  type TournamentRow,
} from "./tournaments";
import { computeTop4 } from "./standings";
import { LOCK_TTL_MS, activeLock, mergeMatches, mergePlayers, touchMatch } from "./live-merge";
import { displayAccount, isOwnerEmail, toLoginEmail } from "./account-id";
import { isUsernameAccount, padAdminPassword } from "./admin-password";
import { logAction, type AuditAction } from "./audit";
import { RECONNECT_EVENT } from "@/hooks/use-connection";
import { buildBracket } from "./bracket";

const ACTIVE_KEY = "beyx-active-tournament";
const STATE_KEY = "beyx-live-state";
const STATE_KEY_PREFIX = `${STATE_KEY}:`;

/** Realtime carries the updates; polling is only a slow safety net. */
const SLOW_POLL_MS = 25000;
/** Railway has no Supabase realtime channel, so each role uses a short poll. */
const RAILWAY_ADMIN_POLL_MS = 2500;
const RAILWAY_PLAYER_POLL_MS = 3000;
/** Coalescing window for rapid scoring taps (first write goes out at once). */
const PUBLISH_TAIL_MS = 250;
/** A held lock is only re-written (and re-synced) once it is this old. */
const LOCK_RENEW_AFTER_MS = Math.round(LOCK_TTL_MS * 0.6);

/** Cloud sync state of the live bracket, surfaced to admins as a badge. */
export type SyncStatus = "idle" | "syncing" | "synced" | "error";

const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

/**
 * Tournament selection is tab-scoped. localStorage is only a reload/new-tab
 * fallback; polling must prefer sessionStorage so two events can be operated
 * in separate tabs without continually switching each other to the newest one.
 */
function readActiveTournamentCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const tabCode = sessionStorage.getItem(ACTIVE_KEY);
    if (tabCode) return tabCode;
    const fallback = localStorage.getItem(ACTIVE_KEY);
    if (fallback) sessionStorage.setItem(ACTIVE_KEY, fallback);
    return fallback;
  } catch {
    return null;
  }
}

function writeActiveTournamentCode(code: string) {
  if (typeof window === "undefined") return;
  const normalized = code.trim().toUpperCase();
  try {
    sessionStorage.setItem(ACTIVE_KEY, normalized);
    localStorage.setItem(ACTIVE_KEY, normalized);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

function clearActiveTournamentCode() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

const persistedStateKey = (code: string) => `${STATE_KEY_PREFIX}${code.trim().toUpperCase()}`;

interface PersistedState {
  players: Player[];
  matches: Match[];
  tableCount: number;
}

function readPersisted(code: string | null): PersistedState | null {
  if (typeof window === "undefined" || !code) return null;
  try {
    const raw = localStorage.getItem(persistedStateKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.matches)) return null;
    return parsed;
  } catch {
    return null;
  }
}

const uid = () => crypto.randomUUID();

interface Ctx extends TournamentState {
  role: Role;
  currentAdmin: CloudAdmin | null;
  authReady: boolean;
  /** Explains why a signed-in account could not enter the admin console. */
  authIssue: string | null;
  setRole: (r: Role) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  claimSuperadmin: () => Promise<string | null>;
  refreshRole: () => Promise<void>;
  logout: () => Promise<void>;
  addPlayers: (names: string[]) => void;
  removePlayer: (id: string) => void;
  setTableCount: (n: number) => void;
  generateBracket: () => void;
  startMatch: (matchId: string, table: number) => void;
  addScore: (
    matchId: string,
    slot: 1 | 2,
    type: FinishType,
    points: number,
    combo1Slot?: 1 | 2 | 3,
    combo2Slot?: 1 | 2 | 3,
  ) => void;
  undoScore: (matchId: string) => void;
  confirmWinner: (matchId: string, forcedWinner?: 1 | 2) => void;
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
  resetTournament: () => Promise<string | null>;
  loadSample: () => void;
  currentTournament: TournamentRow | null;
  startNewTournament: (name: string, logoUrl?: string | null) => Promise<string | null>;
  resumeTournament: (code: string) => Promise<string | null>;
  forceFinishTournament: () => Promise<string | null>;
  results: TournamentResults | null;
  /** True once the event is archived — scoring and starting bouts are frozen. */
  locked: boolean;
  rosterLocked: boolean;
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
    const saved = readPersisted(readActiveTournamentCode());
    if (saved) {
      setPlayers(saved.players);
      setMatches(saved.matches);
      if (typeof saved.tableCount === "number") setTableCount(saved.tableCount);
    }
    setHydrated(true);
  }, [spectator]);

  useEffect(() => {
    if (!hydrated || spectator || !currentTournament || typeof window === "undefined") return;
    localStorage.setItem(
      persistedStateKey(currentTournament.code),
      JSON.stringify({ players, matches, tableCount }),
    );
  }, [hydrated, spectator, currentTournament, players, matches, tableCount]);

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
      timer = setInterval(
        () => {
          if (isVisible()) void pull();
        },
        railwayAuthEnabled ? RAILWAY_PLAYER_POLL_MS : SLOW_POLL_MS,
      );
    };
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    startTimer();

    const channel = railwayAuthEnabled
      ? null
      : supabase
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
      if (channel) supabase.removeChannel(channel);
      if (typeof window !== "undefined") {
        window.removeEventListener(RECONNECT_EVENT, onBack);
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [spectatorCode]);

  const [role, setRoleState] = useState<Role>("player");
  const [currentAdmin, setCurrentAdmin] = useState<CloudAdmin | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authIssue, setAuthIssue] = useState<string | null>(null);

  const syncRole = useCallback(async () => {
    if (!railwayAuthEnabled) {
      const { data, error: userError } = await supabase.auth.getUser();
      const user = data.user;
      if (userError) {
        setCurrentAdmin(null);
        setRoleState("player");
        setAuthIssue("無法讀取登入狀態，請重新登入後再試一次。");
        return "error" as const;
      }
      if (!user) {
        setCurrentAdmin(null);
        setRoleState("player");
        setAuthIssue(null);
        return "signed_out" as const;
      }
      try {
        await promoteGoogleOwnerFn();
        const { role: cloudRole } = await getMyRoleFn();
        if (!cloudRole) {
          setCurrentAdmin(null);
          setRoleState("player");
          setAuthIssue("此帳號已登入，但尚未取得管理者權限。請使用核准的管理者帳號登入。");
          return "not_authorized" as const;
        }
        setCurrentAdmin({
          id: user.id,
          email: displayAccount(user.email),
          isSuper: cloudRole === "superadmin",
          isGoogle:
            user.app_metadata.provider === "google" ||
            user.identities?.some((identity) => identity.provider === "google") === true,
        });
        setRoleState("admin");
        setAuthIssue(null);
        return "admin" as const;
      } catch (error) {
        setCurrentAdmin(null);
        setRoleState("player");
        setAuthIssue(
          error instanceof Error && error.message
            ? `管理者權限驗證失敗：${error.message}`
            : "管理者權限驗證失敗，請重新登入後再試一次。",
        );
        return "error" as const;
      }
    }
    try {
      const user = await fetchRailwaySession();
      if (!user) {
        setCurrentAdmin(null);
        setRoleState("player");
        setAuthIssue(null);
        return "signed_out" as const;
      }
      if (!user.role) {
        setCurrentAdmin(null);
        setRoleState("player");
        setAuthIssue("此 Google 帳號尚未取得管理者權限。");
        return "not_authorized" as const;
      }
      if (user.role === "referee" && (!user.tournamentId || !user.tournamentCode)) {
        setCurrentAdmin(null);
        setRoleState("player");
        setAuthIssue("裁判權限缺少賽事資訊，請重新掃描裁判 QR Code。");
        return "not_authorized" as const;
      }
      if (
        user.role === "referee" &&
        user.tournamentCode &&
        readActiveTournamentCode() !== user.tournamentCode
      ) {
        setCurrentTournament(null);
        setPlayers([]);
        setMatches([]);
        removedPlayers.current = {};
        followedId.current = "";
        playersRef.current = [];
        matchesRef.current = [];
      }
      if (user.role === "referee" && user.tournamentCode)
        writeActiveTournamentCode(user.tournamentCode);
      setCurrentAdmin({
        id: user.id,
        // Keep the stable account identifier here. Google display names are for
        // presentation only; using one for `email` hides owner-only settings
        // because the ownership check must compare the real signed-in email.
        email: displayAccount(user.email),
        isSuper: user.role === "superadmin",
        isGoogle: user.isGoogle,
        isReferee: user.role === "referee",
        tournamentId: user.tournamentId,
        tournamentCode: user.tournamentCode,
      });
      setRoleState("admin");
      setAuthIssue(null);
      return "admin" as const;
    } catch (error) {
      setCurrentAdmin(null);
      setRoleState("player");
      setAuthIssue(
        error instanceof Error && error.message
          ? `登入狀態讀取失敗：${error.message}`
          : "登入狀態讀取失敗，請重新整理後再試。",
      );
      return "error" as const;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void syncRole().finally(() => alive && setAuthReady(true));
    if (railwayAuthEnabled) {
      const refresh = () => void syncRole();
      window.addEventListener("focus", refresh);
      return () => {
        alive = false;
        window.removeEventListener("focus", refresh);
      };
    }
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
      if (railwayAuthEnabled) {
        try {
          await loginRailwayWithPassword(account, password);
          const result = await syncRole();
          return result === "admin" ? null : "登入成功，但此帳號沒有管理者權限。";
        } catch (error) {
          const code = error instanceof Error ? error.message : "LOGIN_FAILED";
          if (code === "TOO_MANY_ATTEMPTS") return "嘗試次數過多，請於 15 分鐘後再試。";
          return "帳號或密碼錯誤。";
        }
      }
      const email = toLoginEmail(account);
      const attempts = isUsernameAccount(account)
        ? [padAdminPassword(password), password]
        : [password];
      for (const pw of attempts) {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (!error) {
          const result = await syncRole();
          return result === "admin" ? null : "登入成功，但此帳號沒有管理者權限。";
        }
      }
      return "帳號或密碼錯誤";
    },
    [syncRole],
  );

  const signInWithGoogle = useCallback(async () => {
    if (railwayAuthEnabled) {
      startRailwayGoogleLogin();
      return null;
    }
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) return result.error.message;
    return result.redirected ? null : "Google 登入未能啟動，請重新嘗試。";
  }, []);

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (railwayAuthEnabled) return "新帳號請先使用 Google 登入，再由總管理者授權。";
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
    if (railwayAuthEnabled) return "總管理者權限已從舊資料庫搬移，不需要重新認領。";
    try {
      await bootstrapSuperadminFn();
      await syncRole();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "設定失敗";
    }
  }, [syncRole]);

  const logout = useCallback(async () => {
    if (railwayAuthEnabled) await logoutRailway();
    else await supabase.auth.signOut().catch(() => undefined);
    setCurrentAdmin(null);
    setRoleState("player");
    // Wipe every trace of the event on this device: the next admin to sign in
    // here must not inherit (or republish) the previous admin's roster.
    if (typeof window !== "undefined") {
      clearActiveTournamentCode();
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key === STATE_KEY || key?.startsWith(STATE_KEY_PREFIX)) localStorage.removeItem(key);
      }
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
      if (matchesRef.current.length) {
        toast.error("賽程已產生，請先重置賽事後再調整選手名單。");
        return;
      }
      if (!currentTournament) {
        toast.error("請先建立賽事並產生報名 QR Code，才能新增參賽者。");
        return;
      }
      const clean = names.map((n) => n.trim()).filter(Boolean);
      if (!clean.length) return;
      setPlayers((prev) => [
        ...prev,
        ...clean.map((name, i) => ({ id: uid(), name, seed: prev.length + i + 1 })),
      ]);
      log("player_add", { names: clean, count: clean.length });
    },
    [log, currentTournament],
  );

  const removePlayer = useCallback(
    (id: string) => {
      if (matchesRef.current.length) {
        toast.error("賽程已產生，請先重置賽事後再調整選手名單。");
        return;
      }
      // Tombstone the id so an older cloud snapshot can't resurrect the player.
      removedPlayers.current[id] = Date.now();
      const gone = playersRef.current.find((p) => p.id === id)?.name;
      setPlayers((prev) => prev.filter((p) => p.id !== id).map((p, i) => ({ ...p, seed: i + 1 })));
      log("player_remove", { name: gone ?? id });
    },
    [log],
  );

  const generateBracket = useCallback(() => {
    if (matchesRef.current.length) {
      toast.error("賽程已產生，請先重置賽事後才能重新抽籤。");
      return;
    }
    // Read the ref instead of a render closure: a final registration can land
    // immediately before the referee taps generate on another device.
    const roster = [...playersRef.current];
    const nextMatches = buildBracket(roster);
    const scheduled = new Set(
      nextMatches.flatMap((match) => [match.p1, match.p2]).filter((id): id is string => !!id),
    );
    if (scheduled.size !== roster.length) {
      toast.error("賽程產生失敗", { description: "選手名單尚未完整同步，請稍後再試。" });
      void pullRef.current?.();
      return;
    }
    setMatches(nextMatches);
    log("bracket_generate", { count: roster.length });
  }, [log]);

  /** Remembers which bouts this device edited, to spot another referee's edits. */
  const localTouch = useRef<Record<string, number>>({});
  const markLocal = (matchId: string) => {
    localTouch.current[matchId] = Date.now();
  };

  // ---- Per-match edit lock (optimistic: rides on the match revision) --------

  const lockInfo = useCallback((match: Match) => activeLock(match), []);

  /** Applies a lock mutation to one match, bumping its revision so it syncs. */
  const setLock = useCallback((matchId: string, lock: { by: string; name: string } | null) => {
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
  }, []);

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
    (
      matchId: string,
      slot: 1 | 2,
      type: FinishType,
      points: number,
      combo1Slot?: 1 | 2 | 3,
      combo2Slot?: 1 | 2 | 3,
    ) => {
      markLocal(matchId);
      let logged: { matchup: string; score: string } | null = null;
      setMatches((prev) =>
        prev.map((m) => {
          if (m.id !== matchId) return m;
          const next = touchMatch({
            ...m,
            score1: slot === 1 ? m.score1 + points : m.score1,
            score2: slot === 2 ? m.score2 + points : m.score2,
            events: [...m.events, { slot, type, points, combo1Slot, combo2Slot }],
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
    (matchId: string, forcedWinner?: 1 | 2) => {
      markLocal(matchId);
      let logged: { matchup: string; winner: string } | null = null;
      setMatches((prev) => {
        const next = prev.map((m) => ({ ...m }));
        const m = next.find((x) => x.id === matchId);
        if (!m) return prev;
        const winner =
          forcedWinner === 1
            ? m.p1
            : forcedWinner === 2
              ? m.p2
              : m.score1 >= WIN_TARGET
                ? m.p1
                : m.score2 >= WIN_TARGET
                  ? m.p2
                  : null;
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

  const resetTournament = useCallback(async () => {
    // A deliberate reset uses a dedicated superadmin-only RPC. Normal sync is
    // never allowed to replace an existing bracket with an empty snapshot.
    const active = currentTournament;
    if (active?.status === "open") {
      const stamp = new Date().toISOString();
      try {
        await resetTournamentLiveState(active.id, tableCount, stamp);
        lastPayload.current = JSON.stringify({ players: [], matches: [], tableCount });
        lastPublishedStamp.current = stampOf(active.status, stamp);
        lastAppliedStamp.current = lastPublishedStamp.current;
      } catch (error) {
        return error instanceof Error ? error.message : "重置賽事同步失敗";
      }
    }
    log("tournament_reset", {
      count: playersRef.current.length,
      localOnly: active?.status === "finished",
    });
    removedPlayers.current = {};
    // Forget the followed event too, otherwise the sync loop re-adopts the
    // same tournament (it is still "open" in the cloud) and it reappears.
    if (typeof window !== "undefined") {
      clearActiveTournamentCode();
      if (active) localStorage.removeItem(persistedStateKey(active.code));
    }
    followedId.current = "";
    if (active) abandonedId.current = active.id;
    playersRef.current = [];
    matchesRef.current = [];
    setPlayers([]);
    setMatches([]);
    setCurrentTournament(null);
    return null;
  }, [currentTournament, tableCount, log]);

  const loadSample = useCallback(() => {
    if (matchesRef.current.length) {
      toast.error("賽程已產生，請先重置賽事後才能載入示範選手。");
      return;
    }
    if (!currentTournament) {
      toast.error("請先建立賽事並產生報名 QR Code，才能載入示範選手。");
      return;
    }
    setMatches([]);
    setPlayers(SAMPLE_NAMES.map((name, i) => ({ id: uid(), name, seed: i + 1 })));
  }, [currentTournament]);

  const startNewTournament = useCallback(async (name: string, logoUrl?: string | null) => {
    const clean = name.trim();
    if (!clean) return "請輸入賽事名稱";
    try {
      const row = await createTournament(clean, logoUrl);
      setCurrentTournament(row);
      writeActiveTournamentCode(row.code);
      if (typeof window !== "undefined") localStorage.removeItem(persistedStateKey(row.code));
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
      // Server-confirmed state — safe to publish from now on.
      hasSyncedOnce.current = true;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "建立賽事失敗";
    }
  }, []);

  /** Switch the admin view back to an existing (in-progress) tournament. */
  const resumeTournament = useCallback(async (code: string) => {
    try {
      const row = await fetchTournamentByCode(code);
      if (!row) return "找不到該賽事";
      setCurrentTournament(row);
      writeActiveTournamentCode(row.code);
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

      // Server-confirmed state — safe to publish from now on.
      hasSyncedOnce.current = true;
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

      // Persist the complete closed bracket before changing the status. Once a
      // tournament is finished, the database rejects every later live write.
      const stamp = new Date().toISOString();
      lastPayload.current = JSON.stringify({ players, matches: closed, tableCount });
      await publishLiveState(currentTournament.id, { players, matches: closed, tableCount }, stamp);
      const row = await finishTournament(currentTournament.id, snapshot);
      lastPublishedStamp.current = stampOf("finished", row.live_updated_at ?? stamp);
      lastAppliedStamp.current = lastPublishedStamp.current;
      setMatches(closed);
      setCurrentTournament(row);
      log("tournament_force_finish", { count: players.length });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "結束賽事失敗";
    }
  }, [currentTournament, matches, players, tableCount, log]);

  // Restore the last created tournament so the QR card survives reloads.
  useEffect(() => {
    if (spectator) return;
    const code = readActiveTournamentCode();
    if (!code) return;
    let alive = true;
    fetchTournamentByCode(code)
      .then((row) => {
        if (alive && row && readActiveTournamentCode() === code) setCurrentTournament(row);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [spectator]);

  // Every signed-in admin follows the event explicitly selected in this tab.
  // Only a tab without a selection adopts the newest open event once.
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
  /**
   * Belt-and-suspenders alongside the server-side roster merge in
   * `publish_live_state`: don't let this device publish at all until it has
   * pulled the real cloud state at least once (or just created/resumed a
   * tournament, which is itself authoritative). A fresh device otherwise
   * hydrates `players` from its own — possibly empty — localStorage first.
   */
  const hasSyncedOnce = useRef(false);

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
      writeActiveTournamentCode(row.code);
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
      const selectedCode = readActiveTournamentCode();
      const row = selectedCode
        ? await fetchTournamentByCode(selectedCode).catch(() => null)
        : await fetchLatestOpenTournament().catch(() => null);

      // Ignore an in-flight response when this tab selected another event while
      // the request was running. This closes the create/resume versus poll race.
      const currentCode = readActiveTournamentCode();
      if (selectedCode ? currentCode !== selectedCode : currentCode && currentCode !== row?.code)
        return;
      if (row) apply(row);
      hasSyncedOnce.current = true;
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
      timer = setInterval(
        () => {
          if (isVisible()) void pull();
        },
        railwayAuthEnabled ? RAILWAY_ADMIN_POLL_MS : SLOW_POLL_MS,
      );
    };
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    startTimer();

    const channel = railwayAuthEnabled
      ? null
      : supabase
          .channel("admin-tournament-follow")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "tournaments" },
            (payload) => {
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
      if (pullTimer) clearTimeout(pullTimer);
      if (channel) supabase.removeChannel(channel);
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
    // Don't publish this device's local snapshot until it has synced with the
    // cloud at least once — belt-and-suspenders alongside the server-side
    // roster merge (see `hasSyncedOnce` declaration above).
    if (!hasSyncedOnce.current) return;
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

  // Archive only after every scheduled bout is settled.  The final can finish
  // before the bronze match; closing at that point used to freeze a stale live
  // snapshot with an in-progress semi-final or third-place card still visible.
  useEffect(() => {
    if (spectator || !results || !currentTournament || currentTournament.status !== "open") return;
    if (matches.some((match) => match.status !== "done")) return;
    if (archivedId.current === currentTournament.id) return;
    archivedId.current = currentTournament.id;
    let alive = true;
    const code = currentTournament.code;
    const snapshot = { players, matches, tableCount };
    const stamp = new Date().toISOString();
    // Persist the fully-settled bracket first.  Once `status` becomes
    // `finished`, normal publishing stops, so this prevents the results row
    // from pointing at an older live_state snapshot.
    lastPayload.current = JSON.stringify(snapshot);
    lastPublishedStamp.current = stampOf(currentTournament.status, stamp);
    lastAppliedStamp.current = lastPublishedStamp.current;
    publishLiveState(currentTournament.id, snapshot, stamp)
      .then(() => finishTournament(currentTournament.id, results))
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
  }, [spectator, results, currentTournament, matches, players, tableCount]);

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

  // The bronze match shares the final's round number, so it is excluded from
  // every round-shape calculation (otherwise round labels shift).
  const mainMatches = useMemo(() => matches.filter((m) => m.kind !== "third"), [matches]);

  const totalRounds = useMemo(
    () => (mainMatches.length ? Math.max(...mainMatches.map((m) => m.round)) + 1 : 0),
    [mainMatches],
  );

  /** True when round 0 is a preliminary round (fewer bouts than a full round). */
  const hasPrelim = useMemo(() => {
    if (totalRounds < 2) return false;
    const c0 = mainMatches.filter((m) => m.round === 0).length;
    const c1 = mainMatches.filter((m) => m.round === 1).length;
    return c0 !== c1 * 2;
  }, [mainMatches, totalRounds]);

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
    rosterLocked: matches.length > 0,

    matches,
    tableCount,
    role: spectator ? "player" : role,
    currentAdmin: spectator ? null : currentAdmin,

    authReady,
    authIssue: spectator ? null : authIssue,
    setRole,
    signIn,
    signInWithGoogle,
    signUp,
    claimSuperadmin,
    refreshRole: async () => {
      await syncRole();
    },
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
