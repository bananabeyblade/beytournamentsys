import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { TournamentProvider, useTournament } from "@/lib/tournament-store";
import { AdminAuthPanel } from "@/components/AdminAuthPanel";
import { ConnectionBanner } from "@/components/ConnectionBanner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "管理者登入 | 竹塹陀螺集會所賽事系統" },
      {
        name: "description",
        content: "裁判與管理者專用登入入口，登入後即可建立賽事、審核報名與輸入比分。",
      },
      { property: "og:title", content: "管理者登入 | 竹塹陀螺集會所賽事系統" },
      {
        property: "og:description",
        content: "Beyblade X 賽事系統的裁判與管理者登入頁面。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <TournamentProvider>
      <AdminLoginPage />
    </TournamentProvider>
  ),
});

function AdminLoginPage() {
  const { currentAdmin } = useTournament();
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <ConnectionBanner />
      <h1 className="flex items-center gap-2 font-display text-2xl neon-text">
        <Shield className="h-6 w-6" /> 管理者登入
      </h1>
      <p className="mb-4 text-[11px] tracking-widest text-muted-foreground">
        ADMIN / REFEREE ACCESS
      </p>
      {currentAdmin && (
        <Link
          to="/"
          className="mb-4 flex min-h-12 w-full items-center justify-center rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
        >
          進入賽事系統
        </Link>
      )}
      <AdminAuthPanel />
    </main>
  );
}
