import { createFileRoute } from "@tanstack/react-router";
import { TournamentProvider } from "@/lib/tournament-store";
import { AppShell } from "@/components/AppShell";

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
      <AppShell />
    </TournamentProvider>
  ),
});
