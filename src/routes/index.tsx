import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Swords, GitBranch, Users, Settings, Shield, Eye } from "lucide-react";
import { TournamentProvider, useTournament } from "@/lib/tournament-store";
import { LiveTab } from "@/components/LiveTab";
import { BracketTab } from "@/components/BracketTab";
import { PlayersTab } from "@/components/PlayersTab";
import { SettingsTab } from "@/components/SettingsTab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Beyblade X 賽事系統 | Tournament Manager" },
      {
        name: "description",
        content:
          "行動優先的 Beyblade X 賽事管理系統：即時對戰計分、隨機賽程樹狀圖、選手名單與裁判權限控管。",
      },
      { property: "og:title", content: "Beyblade X 賽事系統 | Tournament Manager" },
      {
        property: "og:description",
        content: "即時對戰計分、隨機賽程樹狀圖、多桌裁判管理的 Beyblade X 賽事工具。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <TournamentProvider>
      <App />
    </TournamentProvider>
  ),
});

const TABS = [
  { id: "live", label: "對戰", icon: Swords },
  { id: "bracket", label: "賽程", icon: GitBranch },
  { id: "players", label: "選手", icon: Users },
  { id: "settings", label: "設定", icon: Settings },
] as const;

type TabId = (typeof TABS)[number]["id"];

function App() {
  const [tab, setTab] = useState<TabId>("live");
  const { role, setRole, currentAdmin, matches } = useTournament();
  const liveCount = matches.filter((m) => m.status === "live").length;

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg neon-text">竹塹陀螺集會所</h1>
            <p className="truncate text-[11px] tracking-widest text-muted-foreground">
              TOURNAMENT SYSTEM · 賽事管理
            </p>
          </div>
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
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {tab === "live" && <LiveTab />}
        {tab === "bracket" && <BracketTab />}
        {tab === "players" && <PlayersTab />}
        {tab === "settings" && <SettingsTab />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {TABS.map((t) => {
            const active = tab === t.id;
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
    </div>
  );
}
