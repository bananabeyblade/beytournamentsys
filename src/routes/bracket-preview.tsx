import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { BracketTab } from "@/components/BracketTab";
import { TournamentContext, buildBracket } from "@/lib/tournament-store";
import type { Player } from "@/lib/tournament-types";

export const Route = createFileRoute("/bracket-preview")({
  component: Preview,
  head: () => ({
    meta: [
      { title: "64 人賽程表預覽 · 竹塹陀螺集會所" },
      { name: "description", content: "64 人單淘汰賽程樹狀圖預覽（含季軍賽）。" },
    ],
  }),
});

function Preview() {
  const value = useMemo(() => {
    const players: Player[] = Array.from({ length: 64 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `選手 ${i + 1}`,
      seed: i + 1,
    }));
    const matches = buildBracket(players);
    const total = Math.max(...matches.filter((m) => m.kind !== "third").map((m) => m.round)) + 1;
    return {
      players,
      matches,
      playerName: (id: string | null) =>
        id ? (players.find((p) => p.id === id)?.name ?? "—") : "待定 TBD",
      roundName: (round: number) => {
        const left = total - round;
        if (left === 1) return "決賽 FINAL";
        if (left === 2) return "四強 SEMI";
        if (left === 3) return "八強 QUARTER";
        return `第 ${round + 1} 輪 R${round + 1}`;
      },
    };
  }, []);

  return (
    <div className="min-h-screen bg-background p-3 text-foreground">
      <TournamentContext.Provider value={value as never}>
        <BracketTab />
      </TournamentContext.Provider>
    </div>
  );
}
