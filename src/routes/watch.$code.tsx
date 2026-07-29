import { createFileRoute } from "@tanstack/react-router";
import { TournamentProvider } from "@/lib/tournament-store";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/watch/$code")({
  head: () => ({
    meta: [
      { title: "賽事直播畫面 | Beyblade X 賽事系統" },
      {
        name: "description",
        content: "掃碼參賽者專用的 Beyblade X 賽事觀看畫面：即時比分、賽程樹狀圖與選手名單。",
      },
      { property: "og:title", content: "賽事直播畫面 | Beyblade X 賽事系統" },
      {
        property: "og:description",
        content: "即時追蹤 Beyblade X 賽事比分與賽程進度。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WatchPage,
});

function WatchPage() {
  const { code } = Route.useParams();
  return (
    <TournamentProvider spectatorCode={code.toUpperCase()}>
      <AppShell />
    </TournamentProvider>
  );
}
