import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Swords,
  GitBranch,
  Users,
  Settings,
  Shield,
  Eye,
  Moon,
  Sun,
  Loader2,
  Crown,
} from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { LiveTab } from "@/components/LiveTab";
import { BracketTab } from "@/components/BracketTab";
import { PlayersTab } from "@/components/PlayersTab";
import { SettingsTab } from "@/components/SettingsTab";
import { PlatformOwnerTab } from "@/components/PlatformOwnerTab";
import { LandingPage } from "@/components/LandingPage";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import {
  clearJoinedRegistration,
  isSameName,
  readJoinedTournamentCode,
  readJoinedNameForTournament,
  useJoinedName,
} from "@/lib/joined-name";
import { fetchTournamentByCode } from "@/lib/tournaments";
import logoAsset from "@/assets/beyx-logo.png";

const TABS = [
  { id: "live", label: "對戰", icon: Swords },
  { id: "bracket", label: "賽程", icon: GitBranch },
  { id: "players", label: "選手", icon: Users },
  { id: "settings", label: "設定", icon: Settings },
  { id: "platform", label: "開發者", icon: Crown },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_KEY = "beyx-active-tab";

const THEME_KEY = "beyx-theme";

type Theme = "dark" | "light";

function readTab(): TabId {
  if (typeof window === "undefined") return "live";
  const saved = window.localStorage.getItem(TAB_KEY);
  return TABS.some((t) => t.id === saved) ? (saved as TabId) : "live";
}

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function AppShell({ title }: { title?: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("live");
  const [theme, setTheme] = useState<Theme>("dark");
  const { role, setRole, currentAdmin, authReady, matches, spectator, currentTournament, isOwner } =
    useTournament();
  const [showLogin, setShowLogin] = useState(false);
  // Spectators arrive via the QR flow; surface the name they registered with.
  // The route can render before its first Railway poll finishes. Fall back to
  // the QR identity so the participant label is present immediately.
  const participantCode = currentTournament?.code ?? (spectator ? readJoinedTournamentCode() : "");
  const joinedName = useJoinedName(participantCode);

  // Restore a participant only when the saved QR identity still exists in the
  // event's live roster. A lone old code must never trap the browser in
  // spectator mode and hide the administrator login.
  useEffect(() => {
    if (spectator || !authReady || currentAdmin) return;
    const code = readJoinedTournamentCode();
    const name = readJoinedNameForTournament(code);
    if (!code) return;
    if (!name) {
      clearJoinedRegistration();
      return;
    }

    let alive = true;
    void fetchTournamentByCode(code)
      .then((event) => {
        if (!alive) return;
        if (!event || event.status !== "open") {
          clearJoinedRegistration();
          return;
        }
        const exists = event?.live_state?.players.some((player) => {
          const value = player as { name?: unknown };
          return typeof value.name === "string" && isSameName(value.name, name);
        });
        if (exists) {
          void navigate({ to: "/watch/$code", params: { code }, replace: true });
        } else {
          clearJoinedRegistration();
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [authReady, currentAdmin, navigate, spectator]);

  // A finished QR event must not keep this browser inside an obsolete
  // spectator screen. Clear its event-scoped identity and return home.
  useEffect(() => {
    if (!spectator || currentTournament?.status !== "finished") return;
    clearJoinedRegistration();
    void navigate({ to: "/", replace: true });
  }, [currentTournament?.status, navigate, spectator]);

  // Clear a browser's old QR identity when the event has started and that
  // name is not in its published roster. This prevents a stale label from
  // surviving an old test event indefinitely.
  useEffect(() => {
    if (!spectator || !currentTournament?.live_state || !joinedName) return;
    const exists = currentTournament.live_state.players.some((player) => {
      const value = player as { name?: unknown };
      return typeof value.name === "string" && isSameName(value.name, joinedName);
    });
    if (!exists) clearJoinedRegistration();
  }, [currentTournament, joinedName, spectator]);

  // Remember the last tab so a refresh returns to where the user was.
  useEffect(() => {
    setTab(readTab());
  }, []);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  // When the bracket appears (e.g. the superadmin just generated it), jump
  // straight into the running event instead of leaving admins on settings.
  const hasMatches = matches.length > 0;
  useEffect(() => {
    if (hasMatches) setTab("live");
  }, [hasMatches]);

  const liveCount = matches.filter((m) => m.status === "live").length;

  const tabs = currentAdmin?.isReferee
    ? TABS.filter((t) => t.id === "live" || t.id === "bracket")
    : spectator
      ? TABS.filter((t) => t.id !== "settings" && t.id !== "platform")
      : TABS.filter((t) => t.id !== "platform" || isOwner);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "live";

  // While the auth check is still in flight we don't yet know whether to
  // show the dashboard or the logged-out landing content — render neither
  // (a spinner) rather than flashing the dashboard shell first.
  const checkingAuth = !spectator && !authReady;
  const locked = !spectator && authReady && !currentAdmin;
  const isSuper = currentAdmin?.isSuper === true;

  return (
    <div className="min-h-screen pb-24">
      <ConnectionBanner />
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src={currentTournament?.logo_url || logoAsset}
              alt={
                currentTournament?.logo_url
                  ? `${currentTournament.name} logo`
                  : "竹塹陀螺集會所標誌"
              }
              className="h-9 w-9 shrink-0 rounded-lg object-contain"
            />
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg neon-text">
                {title ?? "竹塹陀螺集會所"}
              </h1>
              {currentAdmin?.isReferee ? (
                <p className="truncate text-xs text-primary">
                  裁判 · <span className="font-semibold">{currentAdmin.email}</span>
                </p>
              ) : joinedName && !isSuper ? (
                <p className="truncate text-xs text-primary">
                  參賽者 · <span className="font-semibold">{joinedName}</span>
                </p>
              ) : (
                <p className="truncate text-[11px] tracking-widest text-muted-foreground">
                  TOURNAMENT SYSTEM · 賽事管理
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <SyncStatusBadge />
            <button
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-secondary text-foreground"
              aria-label={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
              title={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {!isSuper && !currentAdmin?.isReferee && (currentAdmin || joinedName) && (
              <button
                onClick={() => setRole(role === "admin" ? "player" : "admin")}
                disabled={role === "player" && !currentAdmin}
                className={`flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold disabled:opacity-50 ${
                  role === "admin"
                    ? "neon-edge bg-accent/40 text-primary"
                    : "border-border bg-secondary text-muted-foreground"
                }`}
              >
                {role === "admin" ? <Shield className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {role === "admin" ? "管理者" : "參賽者"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {checkingAuth ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : locked ? (
          showLogin ? (
            <div className="space-y-3">
              <button
                onClick={() => setShowLogin(false)}
                className="min-h-11 rounded-xl border border-border px-3 text-sm text-muted-foreground"
              >
                返回
              </button>
              <SettingsTab />
            </div>
          ) : (
            <LandingPage onAdminLogin={() => setShowLogin(true)} />
          )
        ) : (
          <>
            {activeTab === "live" && <LiveTab />}
            {activeTab === "bracket" && <BracketTab />}
            {activeTab === "players" && <PlayersTab />}
            {activeTab === "settings" && <SettingsTab onOpenDeveloper={() => setTab("platform")} />}
            {activeTab === "platform" && <PlatformOwnerTab onBack={() => setTab("settings")} />}
          </>
        )}
      </main>

      {!checkingAuth && !locked && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md">
          <div
            className="mx-auto grid max-w-3xl"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <t.icon className="h-6 w-6" />
                  {t.label}
                  {t.id === "live" && liveCount > 0 && (
                    <span className="absolute top-2 right-1/4 grid h-5 w-5 place-items-center rounded-full bg-danger text-[10px] font-bold text-foreground">
                      {liveCount}
                    </span>
                  )}
                  {active && <span className="absolute top-0 h-0.5 w-10 bg-primary" />}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
