import { memo, useCallback, useMemo, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, User } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { useJoinedName, isSameName } from "@/lib/joined-name";
import { MatchHistoryModal } from "./MatchHistoryModal";
import { usePanZoom } from "./bracket/use-pan-zoom";
import type { Match } from "@/lib/tournament-types";

interface CardProps {
  match: Match;
  name1: string;
  name2: string;
  mine1: boolean;
  mine2: boolean;
  onOpen: (id: string) => void;
}

const BracketMatchCard = memo(function BracketMatchCard({
  match: m,
  name1,
  name2,
  mine1,
  mine2,
  onOpen,
}: CardProps) {
  const mine = mine1 || mine2;
  return (
    <button
      type="button"
      disabled={m.status !== "done"}
      onClick={() => onOpen(m.id)}
      style={{ contentVisibility: "auto", containIntrinsicSize: "120px 224px" }}
      className={`w-full rounded-lg border p-2 text-left ${
        m.status === "live"
          ? "danger-edge border-danger/60 bg-danger/10"
          : m.status === "done"
            ? "border-primary/40 bg-accent/20"
            : "border-border bg-secondary/40"
      } ${mine ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
    >
      <div className="mb-1 flex items-center justify-between text-[10px] tracking-widest">
        <span className="flex items-center gap-1 text-muted-foreground">
          M{m.index + 1}
          {mine && (
            <span className="flex items-center gap-0.5 rounded bg-primary px-1 py-0.5 font-bold text-primary-foreground">
              <User className="h-3 w-3" /> 我的比賽
            </span>
          )}
        </span>
        <span
          className={
            m.status === "live"
              ? "text-danger live-pulse"
              : m.status === "done"
                ? "text-primary"
                : "text-muted-foreground"
          }
        >
          {m.status === "live"
            ? `比賽中 · 桌${m.table}`
            : m.status === "done"
              ? "已完成"
              : m.status === "ready"
                ? "待開始"
                : "等待中"}
        </span>
      </div>

      {([1, 2] as const).map((s) => {
        const pid = s === 1 ? m.p1 : m.p2;
        const isWinner = m.winner && m.winner === pid;
        const isMe = s === 1 ? mine1 : mine2;
        return (
          <div
            key={s}
            className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
              isWinner ? "bg-primary/20 font-bold text-primary" : ""
            } ${isMe ? "border border-primary/70 bg-primary/10 font-bold text-primary" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-1 truncate">
              {isMe && <User className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{s === 1 ? name1 : name2}</span>
              {isMe && <span className="shrink-0 text-[10px]">(我)</span>}
            </span>
            <span className="font-display shrink-0">{s === 1 ? m.score1 : m.score2}</span>
          </div>
        );
      })}

      {m.status === "done" && (
        <p className="mt-1 text-center text-[10px] tracking-widest text-primary/70">
          點擊查看比賽歷程
        </p>
      )}
    </button>
  );
});

function RoundColumn({
  label,
  cards,
  align,
}: {
  label: string;
  cards: CardProps[];
  align: "left" | "right";
}) {
  return (
    <div className="flex w-40 min-w-40 flex-col justify-around gap-3 sm:w-56 sm:min-w-56">
      <p
        className={`font-display text-[11px] tracking-widest text-primary ${
          align === "right" ? "text-right" : ""
        }`}
      >
        {label}
      </p>
      {cards.map((c) => (
        <BracketMatchCard key={c.match.id} {...c} />
      ))}
    </div>
  );
}

export function BracketTab() {
  const { matches, players, playerName, roundName } = useTournament();
  const joinedName = useJoinedName();
  const [openId, setOpenId] = useState<string | null>(null);
  const { viewportRef, contentRef, zoom, zoomBy, reset, didMove, handlers } = usePanZoom();

  const openMatch = useMemo(
    () => matches.find((m) => m.id === openId) ?? null,
    [matches, openId],
  );

  const onOpen = useCallback((id: string) => {
    if (didMove.current) return;
    setOpenId(id);
  }, [didMove]);

  // One pass over matches: group by round and pre-resolve names / "is me" flags.
  const rounds = useMemo(() => {
    const map = new Map<number, CardProps[]>();
    for (const m of matches) {
      const name1 = playerName(m.p1);
      const name2 = playerName(m.p2);
      const card: CardProps = {
        match: m,
        name1,
        name2,
        mine1: isSameName(name1, joinedName),
        mine2: isSameName(name2, joinedName),
        onOpen,
      };
      const list = map.get(m.round);
      if (list) list.push(card);
      else map.set(m.round, [card]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, cards]) => ({ round, label: roundName(round), cards }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, joinedName, onOpen]);

  // Large events (>32 players) render as a mirrored bracket: the draw is split
  // evenly to the left and right of the final, which keeps the tree far
  // narrower on a phone screen.
  const split = players.length > 32 && rounds.length > 1;
  const halves = useMemo(() => {
    if (!split) return null;
    const body = rounds.slice(0, -1);
    const final = rounds[rounds.length - 1];
    const left = body.map((r) => ({ ...r, cards: r.cards.slice(0, Math.ceil(r.cards.length / 2)) }));
    const right = body
      .map((r) => ({ ...r, cards: r.cards.slice(Math.ceil(r.cards.length / 2)) }))
      .reverse();
    return { left, right, final };
  }, [split, rounds]);

  if (!matches.length) {
    return <p className="panel p-4 text-sm text-muted-foreground">尚未產生賽程樹狀圖。</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm tracking-widest text-muted-foreground">賽程樹狀圖 BRACKET</h2>
        <div className="flex gap-2">
          <button
            aria-label="縮小"
            onClick={() => zoomBy(-0.2)}
            className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-secondary"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            aria-label="放大"
            onClick={() => zoomBy(0.2)}
            className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-secondary"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            aria-label="重置檢視"
            onClick={reset}
            className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-secondary"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        {...handlers}
        className="panel relative h-[70vh] min-h-80 overflow-hidden"
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <div
          ref={contentRef}
          className="flex items-stretch gap-3 p-3 sm:gap-6"
          style={{ transformOrigin: "0 0", width: "max-content" }}
        >
          {halves ? (
            <>
              {halves.left.map((r) => (
                <RoundColumn key={`l${r.round}`} label={r.label} cards={r.cards} align="left" />
              ))}
              <div className="flex w-40 min-w-40 flex-col justify-center gap-3 sm:w-56 sm:min-w-56">
                <p className="text-center font-display text-[11px] tracking-widest text-primary">
                  {halves.final.label}
                </p>
                {halves.final.cards.map((c) => (
                  <BracketMatchCard key={c.match.id} {...c} />
                ))}
              </div>
              {halves.right.map((r) => (
                <RoundColumn key={`r${r.round}`} label={r.label} cards={r.cards} align="right" />
              ))}
            </>
          ) : (
            rounds.map((r) => (
              <RoundColumn key={r.round} label={r.label} cards={r.cards} align="left" />
            ))
          )}
        </div>
        <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-secondary/80 px-2 py-0.5 text-[10px] tracking-widest text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        可雙指縮放、拖曳移動，雙擊快速放大；點擊已完成的比賽可查看歷程。
        {split && " 超過 32 人時賽程會平均分佈於決賽左右兩側。"}
      </p>
      {openMatch && <MatchHistoryModal match={openMatch} onClose={() => setOpenId(null)} />}
    </div>
  );
}

