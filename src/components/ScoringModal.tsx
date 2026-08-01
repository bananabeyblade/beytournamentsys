import { useEffect, useState } from "react";
import { RotateCcw, X, Trophy, Lock, Unlock } from "lucide-react";
import { FINISHES, WIN_TARGET, type Match } from "@/lib/tournament-types";
import { useTournament } from "@/lib/tournament-store";


const toneClass: Record<string, string> = {
  spin: "bg-spin/20 border-spin text-spin",
  over: "bg-over/20 border-over text-over",
  burst: "bg-burst/20 border-burst text-burst",
  xtreme: "bg-xtreme/25 border-xtreme text-xtreme danger-edge",
};

function SlotCard({
  active,
  onClick,
  name,
  score,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  score: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-center transition ${
        active ? "neon-edge bg-accent/40" : "border-border bg-secondary/50"
      }`}
    >
      <p className="truncate text-sm font-semibold">{name}</p>
      <p className="font-display text-4xl neon-text">{score}</p>
    </button>
  );
}

export function ScoringModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const {
    playerName,
    addScore,
    undoScore,
    confirmWinner,
    roundName,
    locked,
    role,
    currentAdmin,
    lockInfo,
    acquireMatchLock,
    renewMatchLock,
    releaseMatchLock,
    forceUnlockMatch,
    isOwner,
  } = useTournament();
  const [slot, setSlot] = useState<1 | 2>(1);

  const held = lockInfo(match);
  // Someone else is already scoring this bout: show it read-only instead of
  // letting two referees fight over the same score.
  const heldByOther = !!held && held.by !== currentAdmin?.id;

  // Take the lock on open and keep it alive while the modal stays open.
  useEffect(() => {
    if (role !== "admin" || locked) return;
    acquireMatchLock(match.id);
    const beat = setInterval(() => renewMatchLock(match.id), 10000);
    return () => {
      clearInterval(beat);
      releaseMatchLock(match.id);
    };
  }, [match.id, role, locked, acquireMatchLock, renewMatchLock, releaseMatchLock]);

  const reached = match.score1 >= WIN_TARGET || match.score2 >= WIN_TARGET;
  const frozen = reached || locked || heldByOther;
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
          <SlotCard
            active={slot === 1}
            onClick={() => setSlot(1)}
            name={playerName(match.p1)}
            score={match.score1}
          />
          <div className="text-center font-display text-xs text-muted-foreground">VS</div>
          <SlotCard
            active={slot === 2}
            onClick={() => setSlot(2)}
            name={playerName(match.p2)}
            score={match.score2}
          />
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          先取 {WIN_TARGET} 分獲勝 · 目前為 <span className="text-primary">選手 {slot}</span> 加分
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {FINISHES.map((f) => (
            <button
              key={f.type}
              disabled={frozen}
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
          disabled={!match.events.length || locked || heldByOther}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary font-semibold disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5" /> 復原上一步 Undo
        </button>

        {heldByOther && (
          <div className="mt-3 rounded-xl border border-destructive/60 bg-destructive/10 p-3 text-xs">
            <p className="flex items-center gap-2 font-semibold text-destructive">
              <Lock className="h-4 w-4" /> {held?.name} 正在計分，此局暫為唯讀
            </p>
            <p className="mt-1 text-muted-foreground">
              對方關閉計分視窗或斷線 30 秒後會自動解鎖。
            </p>
            {isOwner && (
              <button
                onClick={() => forceUnlockMatch(match.id)}
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/60 bg-accent/40 font-semibold text-primary"
              >
                <Unlock className="h-4 w-4" /> 強制解鎖並接手
              </button>
            )}
          </div>
        )}

        {locked && (
          <p className="mt-3 text-center text-xs text-primary">賽事已結束，計分已封存。</p>
        )}

        {reached && !locked && !heldByOther && (

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
