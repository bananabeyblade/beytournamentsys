import { useState } from "react";
import { RotateCcw, X, Trophy } from "lucide-react";
import { FINISHES, WIN_TARGET, type Match } from "@/lib/tournament-types";
import { useTournament } from "@/lib/tournament-store";

const toneClass: Record<string, string> = {
  spin: "bg-spin/20 border-spin text-spin",
  over: "bg-over/20 border-over text-over",
  burst: "bg-burst/20 border-burst text-burst",
  xtreme: "bg-xtreme/25 border-xtreme text-xtreme danger-edge",
};

export function ScoringModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const { playerName, addScore, undoScore, confirmWinner, roundName } = useTournament();
  const [slot, setSlot] = useState<1 | 2>(1);

  const reached = match.score1 >= WIN_TARGET || match.score2 >= WIN_TARGET;
  const winnerName = match.score1 >= WIN_TARGET ? playerName(match.p1) : playerName(match.p2);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/85 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="panel neon-edge max-h-[94vh] w-full overflow-y-auto rounded-b-none p-4 sm:max-w-lg sm:rounded-2xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs tracking-widest text-muted-foreground">
              裁判計分 · {roundName(match.round)}
              {match.table ? ` · 桌 ${match.table}` : ""}
            </p>
            <h2 className="truncate text-lg neon-text">REFEREE SCORING</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {([1, 2] as const).map((s, i) => (
            <>
              {i === 1 && (
                <div className="text-center font-display text-xs text-muted-foreground">VS</div>
              )}
              <button
                key={s}
                onClick={() => setSlot(s)}
                className={`rounded-xl border p-3 text-center transition ${
                  slot === s ? "neon-edge bg-accent/40" : "border-border bg-secondary/50"
                }`}
              >
                <p className="truncate text-sm font-semibold">
                  {playerName(s === 1 ? match.p1 : match.p2)}
                </p>
                <p className="font-display text-4xl neon-text">
                  {s === 1 ? match.score1 : match.score2}
                </p>
              </button>
            </>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          先取 {WIN_TARGET} 分獲勝 · 目前為 <span className="text-primary">選手 {slot}</span> 加分
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {FINISHES.map((f) => (
            <button
              key={f.type}
              disabled={reached}
              onClick={() => addScore(match.id, slot, f.type, f.points)}
              className={`min-h-20 rounded-xl border-2 px-3 py-3 text-left font-semibold disabled:opacity-40 ${toneClass[f.tone]}`}
            >
              <span className="font-display text-2xl">+{f.points}</span>
              <span className="block text-sm">{f.zh}</span>
              <span className="block text-[11px] opacity-80">{f.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => undoScore(match.id)}
          disabled={!match.events.length}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary font-semibold disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5" /> 復原上一步 Undo
        </button>

        {reached && (
          <div className="mt-4 rounded-xl border-2 border-primary bg-accent/40 p-4 text-center neon-edge">
            <Trophy className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 font-display text-lg neon-text">{winnerName} Wins!</p>
            <p className="text-xs text-muted-foreground">確認後將自動晉級下一輪</p>
            <button
              onClick={() => {
                confirmWinner(match.id);
                onClose();
              }}
              className="mt-3 min-h-14 w-full rounded-xl bg-primary font-display text-lg text-primary-foreground"
            >
              確認勝利 CONFIRM
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
