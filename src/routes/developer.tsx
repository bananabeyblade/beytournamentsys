import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Terminal } from "lucide-react";
import { TournamentProvider, useTournament } from "@/lib/tournament-store";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { ManageAdmins, ManageSuperadmins } from "@/components/AccountSettings";
import { TournamentHistory } from "@/components/TournamentHistory";
import { SystemStatusCard } from "@/components/SystemStatusCard";
import { isDeveloperEmail } from "@/lib/account-id";

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [{ title: "開發者控制台 | 竹塹陀螺集會所賽事系統" }],
  }),
  component: () => (
    <TournamentProvider>
      <DeveloperConsolePage />
    </TournamentProvider>
  ),
});

function DeveloperConsolePage() {
  const { currentAdmin, setRole } = useTournament();
  const navigate = useNavigate();

  // This console is only reachable by the developer; ensure SystemStatusCard's
  // internal admin-role gate is satisfied even though this route mounts a
  // fresh TournamentProvider (role defaults back to "player" per instance).
  useEffect(() => {
    if (currentAdmin && isDeveloperEmail(currentAdmin.email)) setRole("admin");
  }, [currentAdmin, setRole]);

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 pb-6">
      <ConnectionBanner />
      <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else void navigate({ to: "/" });
          }}
          className="mb-2 flex min-h-10 items-center gap-2 rounded-xl border border-border bg-secondary px-3 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <h1 className="flex items-center gap-2 font-display text-2xl neon-text">
          <Terminal className="h-6 w-6" /> 開發者控制台
        </h1>
        <p className="text-[11px] tracking-widest text-muted-foreground">DEVELOPER CONSOLE</p>
      </div>

      {!currentAdmin ? (
        <div className="panel space-y-3 p-3">
          <p className="text-sm text-muted-foreground">請先登入管理者帳號。</p>
          <Link
            to="/admin"
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
          >
            前往登入
          </Link>
        </div>
      ) : !isDeveloperEmail(currentAdmin.email) ? (
        <div className="panel space-y-3 p-3">
          <p className="text-sm text-muted-foreground">此頁面僅限開發者帳號使用。</p>
          <Link
            to="/"
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
          >
            返回賽事系統
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <TournamentHistory />
          <ManageSuperadmins />
          <ManageAdmins />
          <SystemStatusCard />
        </div>
      )}
    </main>
  );
}
