import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { Play, Swords, Radio, Trophy } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import type { Match } from "@/lib/tournament-types";
import { ScoringModal } from "./ScoringModal";

function MatchCard({
  match,
  onOpen,
  onStart,
}: {
  match: Match;
  onOpen: () => void;
  onStart: () => void;
}) {
  const { playerName, roundName, role, locked } = useTournament();
  const isLive = match.status === "live";


  return (
    <div className={`panel p-3 ${isLive ? "neon-edge" : ""}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <p className="truncate text-xs tracking-widest text-muted-foreground">
          {roundName(match.round)}
          {match.table ? ` · 桌號 TABLE ${match.table}` : ""}
        </p>
        {isLive ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-danger/60 bg-danger/15 px-2 py-0.5 text-[11px] font-bold text-danger">
            <Radio className="h-3 w-3 live-pulse" /> 比賽中
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
            待開始
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <p className="truncate text-sm font-semibold">{playerName(match.p1)}</p>
        <p className="font-display text-2xl neon-text">
          {match.score1} - {match.score2}
        </p>
        <p className="truncate text-right text-sm font-semibold">{playerName(match.p2)}</p>
      </div>

      {role === "admin" && !locked && (
        <button

          onClick={isLive ? onOpen : onStart}
          className={`mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl font-display text-sm ${
            isLive
              ? "bg-primary text-primary-foreground"
              : "border border-primary/60 bg-accent/40 text-primary"
          }`}
        >
          {isLive ? (
            <>
              <Swords className="h-4 w-4" /> 進入計分
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> 開始比賽
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function LiveTab() {
  const { matches, tableCount, startMatch, role, results, currentTournament, locked } =
    useTournament();

  const [openId, setOpenId] = useState<string | null>(null);
  const [startId, setStartId] = useState<string | null>(null);

  const live = matches.filter((m) => m.status === "live");
  const ready = matches.filter((m) => m.status === "ready");
  const openMatch = matches.find((m) => m.id === openId) ?? null;
  const usedTables = new Set(live.map((m) => m.table));

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm tracking-widest text-muted-foreground">
          進行中 LIVE ({live.length})
        </h2>
        {live.length ? (
          <div className="space-y-3">
            {live.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onOpen={() => setOpenId(m.id)}
                onStart={() => setStartId(m.id)}
              />
            ))}
          </div>
        ) : (
          <p className="panel p-4 text-sm text-muted-foreground">目前沒有進行中的比賽。</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm tracking-widest text-muted-foreground">
          等待開賽 UPCOMING ({ready.length})
        </h2>
        {ready.length ? (
          <div className="space-y-3">
            {ready.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onOpen={() => setOpenId(m.id)}
                onStart={() => setStartId(m.id)}
              />
            ))}
          </div>
        ) : (
          <p className="panel p-4 text-sm text-muted-foreground">
            {matches.length ? "所有比賽已完成或等待上一輪結果。" : "尚未產生賽程，請前往設定頁。"}
          </p>
        )}
      </section>

      {results && (
        <div className="panel neon-edge space-y-3 p-4 text-center">
          <Trophy className="mx-auto h-7 w-7 text-primary" />
          <p className="font-display neon-text">賽事完成 · 前四名已產生</p>
          <ol className="space-y-1 text-sm">
            {results.top4.map((e) => (
              <li key={e.rank}>
                <span className="font-display text-primary">{e.rank}</span> · {e.name}
              </li>
            ))}
          </ol>
          {currentTournament && (
            <Link
              to="/results/$code"
              params={{ code: currentTournament.code }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
            >
              查看成績頁面
            </Link>
          )}
        </div>
      )}


      {startId && role === "admin" && !locked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-4 backdrop-blur-sm">
          <div className="panel neon-edge w-full max-w-sm p-4">
            <h3 className="text-base neon-text">選擇桌號 SELECT TABLE</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {Array.from({ length: tableCount }, (_, i) => i + 1).map((t) => (
                <button
                  key={t}
                  disabled={usedTables.has(t)}
                  onClick={() => {
                    startMatch(startId, t);
                    setStartId(null);
                    setOpenId(startId);
                  }}
                  className="min-h-14 rounded-xl border border-primary/50 bg-accent/30 font-display text-primary disabled:opacity-30"
                >
                  桌 {t}
                </button>
              ))}
            </div>
            <button
              onClick={() => setStartId(null)}
              className="mt-3 min-h-12 w-full rounded-xl border border-border bg-secondary"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {openMatch && role === "admin" && (
        <ScoringModal match={openMatch} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
