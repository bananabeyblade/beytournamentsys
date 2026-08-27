import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Play, Swords, Radio, Trophy, Star } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import type { Match } from "@/lib/tournament-types";
import { ScoringModal } from "./ScoringModal";
import { useJoinedName, isSameName } from "@/lib/joined-name";
import { fetchDeckReport } from "@/lib/deck-report";
import { buildPodiumDecks } from "@/lib/podium-decks";
import { useDeckRegistrationEnabled } from "@/hooks/use-deck-registration-enabled";

function MatchCard({
  match,
  onOpen,
  onStart,
  joinedName,
}: {
  match: Match;
  onOpen: () => void;
  onStart: () => void;
  joinedName: string;
}) {
  const { playerName, roundName, role, locked, scoringElsewhere } = useTournament();
  const isLive = match.status === "live";
  const busy = isLive && scoringElsewhere(match);
  const name1 = playerName(match.p1);
  const name2 = playerName(match.p2);
  const mine1 = isSameName(name1, joinedName);
  const mine2 = isSameName(name2, joinedName);
  const mine = mine1 || mine2;

  return (
    <div className={`panel p-3 ${mine ? "neon-edge bg-primary/5" : isLive ? "neon-edge" : ""}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <p className="truncate text-xs tracking-widest text-muted-foreground">
          {match.kind === "third" ? "季軍賽 3RD" : roundName(match.round)}
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

      {mine && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-bold tracking-widest text-primary">
          <Star className="h-3 w-3" /> 你的比賽 YOUR MATCH
        </p>
      )}

      {busy && <p className="mt-1 text-[11px] text-over">其他裁判正在計分中 · 請避免同時操作</p>}

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <p className={`truncate text-sm font-semibold ${mine1 ? "text-primary" : ""}`}>
          {name1}
          {mine1 ? "（你）" : ""}
        </p>
        <p className="font-display text-2xl neon-text">
          {match.score1} - {match.score2}
        </p>
        <p className={`truncate text-right text-sm font-semibold ${mine2 ? "text-primary" : ""}`}>
          {name2}
          {mine2 ? "（你）" : ""}
        </p>
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
  const { matches, tableCount, startMatch, role, results, currentTournament, locked, playerName } =
    useTournament();
  const joinedName = useJoinedName(currentTournament?.code);
  const deckRegistrationEnabled = useDeckRegistrationEnabled();

  const [openId, setOpenId] = useState<string | null>(null);
  const [startId, setStartId] = useState<string | null>(null);
  const tournamentId = currentTournament?.id;
  const podiumReport = useQuery({
    queryKey: ["podium-deck-report", tournamentId],
    queryFn: () => fetchDeckReport(tournamentId!),
    enabled:
      deckRegistrationEnabled && role === "admin" && !!results?.top4.length && !!tournamentId,
  });
  const podiumDecks =
    results && podiumReport.data ? buildPodiumDecks(results.top4, podiumReport.data) : [];

  // Put the spectator's own match first so they see it without scrolling.
  const isMine = (m: Match) =>
    isSameName(playerName(m.p1), joinedName) || isSameName(playerName(m.p2), joinedName);
  const mineFirst = (list: Match[]) =>
    [...list].sort((a, b) => Number(isMine(b)) - Number(isMine(a)));

  const live = mineFirst(matches.filter((m) => m.status === "live"));
  const ready = mineFirst(matches.filter((m) => m.status === "ready"));
  const openMatch = matches.find((m) => m.id === openId) ?? null;
  const usedTables = new Set(live.map((m) => m.table));

  return (
    <div className="space-y-5">
      {locked && (
        <p className="panel border-primary/50 p-3 text-center text-sm text-primary">
          本場賽事已結束，比分與賽程已封存，無法再修改。
        </p>
      )}

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
                joinedName={joinedName}
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
                joinedName={joinedName}
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
          {role === "admin" && deckRegistrationEnabled && (
            <section className="rounded-xl border border-primary/40 bg-accent/15 p-3 text-left">
              <p className="text-center font-display text-xs tracking-widest text-primary">
                TOP 3 · DECK / COMBO
              </p>
              <p className="mt-1 text-center text-[10px] text-muted-foreground">
                分開顯示八強 Deck 快照與逐局實戰 Combo；舊紀錄會標示推估。
              </p>
              {podiumReport.isLoading ? (
                <p className="mt-3 text-center text-xs text-muted-foreground">讀取前三名 Deck…</p>
              ) : podiumReport.isError ? (
                <p className="mt-3 text-center text-xs text-destructive">
                  暫時無法載入 Deck／Combo。
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {podiumDecks.map((entry) => (
                    <article
                      key={entry.rank}
                      className="rounded-lg border border-border bg-background/65 p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-primary/50 font-display text-primary">
                          {entry.rank}
                        </span>
                        <p className="min-w-0 truncate text-sm font-semibold">{entry.name}</p>
                      </div>
                      <p className="mt-2 text-[10px] font-semibold tracking-widest text-muted-foreground">
                        登錄 DECK
                      </p>
                      {entry.combos.length ? (
                        <ol className="mt-1 space-y-1.5">
                          {entry.combos.map((combo) => (
                            <li
                              key={combo.slot}
                              className="rounded-md border border-border/80 bg-secondary/45 px-2 py-1.5 text-[11px]"
                            >
                              <p className="break-words leading-relaxed">
                                <span className="mr-1 font-display text-primary">
                                  {String.fromCharCode(64 + combo.slot)}
                                </span>
                                {combo.label}
                              </p>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-2 text-center text-[11px] text-muted-foreground">
                          未登錄 Deck 或無八強快照
                        </p>
                      )}
                      <p className="mt-3 text-[10px] font-semibold tracking-widest text-muted-foreground">
                        實戰 COMBO
                      </p>
                      {entry.playedCombos.length ? (
                        <ul className="mt-1 space-y-1.5">
                          {entry.playedCombos.map((combo) => (
                            <li
                              key={combo.key}
                              className="rounded-md border border-primary/30 bg-accent/20 px-2 py-1.5 text-[11px]"
                            >
                              <p className="break-words leading-relaxed">{combo.label}</p>
                              <p className="mt-0.5 text-right text-[10px] text-muted-foreground">
                                {combo.battles} 局
                                {combo.estimated ? " · 舊紀錄推估" : " · 實際快照"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-center text-[11px] text-muted-foreground">
                          尚無逐局 Combo 紀錄
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
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

      {openMatch && role === "admin" && !locked && (
        <ScoringModal match={openMatch} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
