import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy, ArrowLeft } from "lucide-react";
import { fetchTournamentByCode, type TournamentRow } from "@/lib/tournaments";

export const Route = createFileRoute("/results/$code")({
  head: () => ({
    meta: [
      { title: "賽事成績前四名 | 竹塹陀螺集會所" },
      {
        name: "description",
        content: "查看本場 Beyblade X 賽事的冠軍、亞軍與季殿軍成績，掃碼即可分享的前四名榜單。",
      },
      { property: "og:title", content: "賽事成績前四名 | 竹塹陀螺集會所" },
      {
        property: "og:description",
        content: "Beyblade X 賽事自動生成的前四名成績榜單。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResultsPage,
});

const RANK_LABEL = ["冠軍 1st", "亞軍 2nd", "季軍 3rd", "殿軍 4th"];

function ResultsPage() {
  const { code } = Route.useParams();
  const [row, setRow] = useState<TournamentRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchTournamentByCode(code)
      .then((r) => alive && setRow(r))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 px-4 py-8">
      <Link to="/" className="flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> 回到賽事系統
      </Link>

      <div>
        <h1 className="font-display text-2xl neon-text">賽事成績</h1>
        <p className="text-[11px] tracking-widest text-muted-foreground">FINAL STANDINGS · TOP 4</p>
        {row && (
          <div className="mt-1 flex items-center gap-2">
            {row.logo_url && (
              <img
                src={row.logo_url}
                alt={`${row.name} logo`}
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            )}
            <p className="text-sm text-primary">{row.name}</p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="panel p-4 text-sm text-muted-foreground">讀取中…</div>
      ) : !row ? (
        <div className="panel p-4 text-sm text-muted-foreground">找不到這場賽事。</div>
      ) : !row.results?.top4?.length ? (
        <div className="panel p-4 text-sm text-muted-foreground">
          這場賽事尚未結束，決賽結束後會自動生成前四名榜單。
        </div>
      ) : (
        <ul className="space-y-2">
          {row.results.top4.map((e) => (
            <li
              key={e.rank}
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-4 ${
                e.rank === 1 ? "neon-edge bg-accent/30" : "border-border bg-secondary/40"
              }`}
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg border border-primary/40 font-display text-lg text-primary">
                {e.rank}
              </span>
              <span className="truncate font-display text-lg">{e.name}</span>
              <span className="text-[11px] tracking-widest text-muted-foreground">
                {RANK_LABEL[e.rank - 1]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {row?.results && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Trophy className="h-4 w-4 text-primary" /> 共 {row.results.playerCount} 位選手參賽 · 代碼{" "}
          {row.code}
        </p>
      )}
    </main>
  );
}
