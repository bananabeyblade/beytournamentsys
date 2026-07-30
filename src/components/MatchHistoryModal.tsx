import { X, Trophy } from "lucide-react";
import { FINISHES, type Match } from "@/lib/tournament-types";
import { useTournament } from "@/lib/tournament-store";

export function MatchHistoryModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const { playerName, roundName } = useTournament();

  let s1 = 0;
  let s2 = 0;
  const rows = match.events.map((e, i) => {
    if (e.slot === 1) s1 += e.points;
    else s2 += e.points;
    const f = FINISHES.find((x) => x.type === e.type);
    return {
      key: i,
      no: i + 1,
      who: playerName(e.slot === 1 ? match.p1 : match.p2),
      label: f ? `${f.zh} ${f.label}` : e.type,
      tone: f?.tone ?? "spin",
      points: e.points,
      running: `${s1} - ${s2}`,
    };
  });

  const toneText: Record<string, string> = {
    spin: "text-spin",
    over: "text-over",
    burst: "text-burst",
    xtreme: "text-xtreme",
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm text-primary">{roundName(match.round)}</p>
          <p className="truncate text-[11px] tracking-widest text-muted-foreground">
            比賽歷程 MATCH LOG
          </p>
        </div>
        <button
          aria-label="關閉"
          onClick={onClose}
          className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-secondary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
        <div className="panel grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 p-3 text-center">
          <div className="min-w-0">
            <p className="truncate text-sm">{playerName(match.p1)}</p>
            <p className="font-display text-4xl neon-text">{match.score1}</p>
          </div>
          <span className="text-muted-foreground">VS</span>
          <div className="min-w-0">
            <p className="truncate text-sm">{playerName(match.p2)}</p>
            <p className="font-display text-4xl neon-text">{match.score2}</p>
          </div>
        </div>

        {match.winner && (
          <p className="flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-accent/30 py-3 font-display text-primary">
            <Trophy className="h-5 w-5" /> 勝者 {playerName(match.winner)}
          </p>
        )}

        <div className="panel p-3">
          <h3 className="mb-2 text-sm tracking-widest text-muted-foreground">每局得分 ROUNDS</h3>
          {rows.length ? (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.key}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-md border border-border font-display text-xs text-muted-foreground">
                    {r.no}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{r.who}</span>
                    <span className={`block truncate text-xs ${toneText[r.tone]}`}>
                      {r.label} +{r.points}
                    </span>
                  </span>
                  <span className="font-display text-sm text-primary">{r.running}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              此場比賽沒有計分紀錄（輪空或直接晉級）。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
