import { useEffect, useState } from "react";
import { Swords, GitBranch, Users, Settings, Shield, Eye, QrCode } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { LiveTab } from "@/components/LiveTab";
import { BracketTab } from "@/components/BracketTab";
import { PlayersTab } from "@/components/PlayersTab";
import { SettingsTab } from "@/components/SettingsTab";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { useJoinedName } from "@/lib/joined-name";
import logoAsset from "@/assets/beyx-logo.png";

const TABS = [
  { id: "live", label: "對戰", icon: Swords },
  { id: "bracket", label: "賽程", icon: GitBranch },
  { id: "players", label: "選手", icon: Users },
  { id: "settings", label: "設定", icon: Settings },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_KEY = "beyx-active-tab";

function readTab(): TabId {
  if (typeof window === "undefined") return "live";
  const saved = window.localStorage.getItem(TAB_KEY);
  return TABS.some((t) => t.id === saved) ? (saved as TabId) : "live";
}

export function AppShell({ title }: { title?: string }) {
  const [tab, setTab] = useState<TabId>("live");
  const { role, setRole, currentAdmin, authReady, matches, spectator, currentTournament } =
    useTournament();
  const [showLogin, setShowLogin] = useState(false);
  // Spectators arrive via the QR flow; surface the name they registered with.
  const joinedName = useJoinedName();

  // Remember the last tab so a refresh returns to where the user was.
  useEffect(() => {
    setTab(readTab());
  }, []);

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

  const tabs = spectator ? TABS.filter((t) => t.id !== "settings") : TABS;
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "live";

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
              alt={currentTournament?.logo_url ? `${currentTournament.name} logo` : "竹塹陀螺集會所標誌"}
              className="h-9 w-9 shrink-0 rounded-lg object-contain"
            />
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg neon-text">
                {title ?? "竹塹陀螺集會所"}
              </h1>
              {joinedName && !isSuper ? (
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
            {!isSuper && (
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
        {locked ? (
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
            <div className="panel space-y-3 p-6 text-center">
              <QrCode className="mx-auto h-12 w-12 text-primary" />
              <p className="font-display text-lg neon-text">請掃描賽事 QR Code</p>
              <p className="text-sm text-muted-foreground">
                參賽者請掃描裁判提供的報名 QR Code 並輸入名稱，比賽開始後會自動進入賽事畫面。
              </p>
              <button
                onClick={() => setShowLogin(true)}
                className="min-h-12 w-full rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
              >
                我是管理者 / 裁判
              </button>
            </div>
          )
        ) : (
          <>
            {activeTab === "live" && <LiveTab />}
            {activeTab === "bracket" && <BracketTab />}
            {activeTab === "players" && <PlayersTab />}
            {activeTab === "settings" && <SettingsTab />}
          </>
        )}
      </main>

      {!locked && (
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
