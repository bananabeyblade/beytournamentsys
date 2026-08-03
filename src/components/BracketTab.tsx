import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, User } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { useJoinedName, isSameName } from "@/lib/joined-name";
import { MatchHistoryModal } from "./MatchHistoryModal";
import { usePanZoom } from "./bracket/use-pan-zoom";
import type { Match } from "@/lib/tournament-types";

/* Geometry of the classic bracket tree (px, unscaled — pan/zoom handles fit). */
const CARD_H = 46;
const ROW_GAP = 14;
const PITCH = CARD_H + ROW_GAP;
const COL_W = 130;
const CONN_W = 26;
const HEAD_H = 22;

interface CardProps {
  match: Match;
  name1: string;
  name2: string;
  seed1: number | null;
  seed2: number | null;
  mine1: boolean;
  mine2: boolean;
  onOpen: (id: string) => void;
}

const BracketMatchCard = memo(function BracketMatchCard({
  match: m,
  name1,
  name2,
  seed1,
  seed2,
  mine1,
  mine2,
  onOpen,
}: CardProps) {
  const mine = mine1 || mine2;
  const done = m.status === "done";
  const openable = done || m.status === "live" || (m.events?.length ?? 0) > 0;
  return (
    <button
      type="button"
      disabled={!openable}
      onClick={() => onOpen(m.id)}
      title={openable ? `M${m.index + 1} · 點擊查看比賽紀錄` : `M${m.index + 1}`}
      aria-label={`第 ${m.index + 1} 場 ${name1} 對 ${name2}`}
      style={{ contain: "layout paint", height: CARD_H }}
      className={`relative w-full overflow-hidden rounded-md border text-left ${
        m.status === "live"
          ? "danger-edge border-danger/70 bg-danger/10"
          : done
            ? "border-primary/50 bg-accent/20"
            : "border-border bg-secondary/40"
      } ${mine ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
    >
      {m.status === "live" && (
        <span className="live-pulse absolute top-0.5 right-1 text-[8px] tracking-widest text-danger">
          LIVE·桌{m.table}
        </span>
      )}
      {mine && (
        <span className="absolute top-0.5 right-1 grid h-3 w-3 place-items-center rounded-full bg-primary text-primary-foreground">
          <User className="h-2 w-2" />
        </span>
      )}
      {([1, 2] as const).map((s) => {
        const pid = s === 1 ? m.p1 : m.p2;
        const isWinner = m.winner != null && m.winner === pid;
        const isMe = s === 1 ? mine1 : mine2;
        const seed = s === 1 ? seed1 : seed2;
        return (
          <div
            key={s}
            className={`flex h-[22px] items-center gap-1 px-1 text-[11px] ${
              s === 1 ? "border-b border-border/60" : ""
            } ${isWinner ? "font-bold text-primary" : ""} ${
              isMe ? "bg-primary/10 font-bold text-primary" : ""
            }`}
          >
            <span className="w-4 shrink-0 text-right text-[9px] text-muted-foreground">
              {seed ?? ""}
            </span>
            <span className="min-w-0 flex-1 truncate">{s === 1 ? name1 : name2}</span>
            <span className="font-display shrink-0 text-[11px]">
              {s === 1 ? m.score1 : m.score2}
            </span>
          </div>
        );
      })}
    </button>
  );
});

/** Positions of every column of one half, derived bottom-up from the leaves. */
function halfPositions(counts: number[], height: number): number[][] {
  if (!counts.length) return [];
  const leafCount = counts[0];
  const offset = (height - PITCH * leafCount) / 2;
  const out: number[][] = [Array.from({ length: leafCount }, (_, i) => offset + PITCH * (i + 0.5))];
  for (let k = 1; k < counts.length; k++) {
    const prev = out[k - 1];
    out.push(
      Array.from({ length: counts[k] }, (_, j) => {
        const a = prev[j * 2];
        const b = prev[j * 2 + 1];
        // Odd half: the last card has a single source, so sit exactly on it.
        if (a == null) return b ?? height / 2;
        return b == null ? a : (a + b) / 2;
      }),
    );
  }

  return out;
}

function Column({
  label,
  cards,
  ys,
  height,
  align,
}: {
  label: string;
  cards: CardProps[];
  ys: number[];
  height: number;
  align: "left" | "right" | "center";
}) {
  return (
    <div className="shrink-0" style={{ width: COL_W }}>
      <p
        className={`font-display truncate text-[10px] tracking-widest text-primary ${
          align === "right" ? "text-right" : align === "center" ? "text-center" : ""
        }`}
        style={{ height: HEAD_H }}
      >
        {label}
      </p>
      <div className="relative" style={{ height }}>
        {cards.map((c, i) => (
          <div
            key={c.match.id}
            className="absolute inset-x-0"
            style={{ top: (ys[i] ?? height / 2) - CARD_H / 2 }}
          >
            <BracketMatchCard {...c} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Centre column: the final, with the bronze match hung underneath it. */
function FinalColumn({
  label,
  final,
  bronze,
  y,
  height,
}: {
  label: string;
  final: CardProps[];
  bronze: CardProps | null;
  y: number;
  height: number;
}) {
  const bronzeTop = y + PITCH * 1.4;
  return (
    <div className="shrink-0" style={{ width: COL_W }}>
      <p
        className="font-display truncate text-center text-[10px] tracking-widest text-primary"
        style={{ height: HEAD_H }}
      >
        {label}
      </p>
      <div className="relative" style={{ height }}>
        {final.map((c) => (
          <div key={c.match.id} className="absolute inset-x-0" style={{ top: y - CARD_H / 2 }}>
            <BracketMatchCard {...c} />
          </div>
        ))}
        {bronze && (
          <div className="absolute inset-x-0" style={{ top: bronzeTop - CARD_H / 2 }}>
            <p className="font-display mb-0.5 text-center text-[9px] tracking-widest text-muted-foreground">
              季軍賽 3RD
            </p>
            <BracketMatchCard {...bronze} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Bracket-shaped connectors drawn straight from the real card centres.
 * `fromYs` = source column centres, `toYs` = target column centres.
 */
function Connectors({
  fromYs,
  toYs,
  height,
  mirror,
}: {
  fromYs: number[];
  toYs: number[];
  height: number;
  mirror: boolean;
}) {
  const mid = CONN_W / 2;
  const near = mirror ? { right: 0 } : { left: 0 };
  const far = mirror ? { left: 0 } : { right: 0 };
  return (
    <div className="shrink-0" style={{ width: CONN_W }}>
      <div style={{ height: HEAD_H }} />
      <div className="relative" style={{ height }}>
        {toYs.map((yMid, j) => {
          const a = fromYs[j * 2];
          const b = fromYs[j * 2 + 1];
          const ends = [a, b].filter((v): v is number => v != null);
          const top = Math.min(...ends, yMid);
          const bottom = Math.max(...ends, yMid);
          return (
            <div key={j}>
              {ends.map((y, k) => (
                <span
                  key={k}
                  className="absolute border-t border-border"
                  style={{ ...near, top: y, width: mid }}
                />
              ))}

              {bottom > top && (
                <span
                  className="absolute border-l border-border"
                  style={{
                    [mirror ? "right" : "left"]: mid,
                    top,
                    height: bottom - top,
                  }}
                />
              )}
              <span
                className="absolute border-t border-border"
                style={{ ...far, top: yMid, width: mid }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Link feeding the centred final from the last card of one half. */
function FinalLink({
  from,
  to,
  height,
  mirror,
}: {
  from: number;
  to: number;
  height: number;
  mirror: boolean;
}) {
  const mid = CONN_W / 2;
  const near = mirror ? { right: 0 } : { left: 0 };
  const far = mirror ? { left: 0 } : { right: 0 };
  const top = Math.min(from, to);
  const bottom = Math.max(from, to);
  return (
    <div className="shrink-0" style={{ width: CONN_W }}>
      <div style={{ height: HEAD_H }} />
      <div className="relative" style={{ height }}>
        <span
          className="absolute border-t border-border"
          style={{ ...near, top: from, width: mid }}
        />
        {bottom > top && (
          <span
            className="absolute border-l border-border"
            style={{ [mirror ? "right" : "left"]: mid, top, height: bottom - top }}
          />
        )}
        <span className="absolute border-t border-border" style={{ ...far, top: to, width: mid }} />
      </div>
    </div>
  );
}

/** One link per preliminary bout, drawn to the main-draw card it feeds. */
function PrelimLinks({
  pairs,
  height,
  mirror,
}: {
  pairs: { from: number; to: number }[];
  height: number;
  mirror: boolean;
}) {
  const mid = CONN_W / 2;
  const near = mirror ? { right: 0 } : { left: 0 };
  const far = mirror ? { left: 0 } : { right: 0 };
  return (
    <div className="shrink-0" style={{ width: CONN_W }}>
      <div style={{ height: HEAD_H }} />
      <div className="relative" style={{ height }}>
        {pairs.map(({ from, to }, i) => {
          const top = Math.min(from, to);
          const bottom = Math.max(from, to);
          return (
            <div key={i}>
              <span
                className="absolute border-t border-border"
                style={{ ...near, top: from, width: mid }}
              />
              {bottom > top && (
                <span
                  className="absolute border-l border-border"
                  style={{ [mirror ? "right" : "left"]: mid, top, height: bottom - top }}
                />
              )}
              <span
                className="absolute border-t border-border"
                style={{ ...far, top: to, width: mid }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}



export function BracketTab() {
  const { matches, players, playerName, roundName } = useTournament();
  const joinedName = useJoinedName();
  const [openId, setOpenId] = useState<string | null>(null);
  const { viewportRef, contentRef, zoom, zoomBy, reset, fit, didMove, handlers } = usePanZoom();

  const openMatch = useMemo(() => matches.find((m) => m.id === openId) ?? null, [matches, openId]);

  const onOpen = useCallback(
    (id: string) => {
      if (didMove.current) return;
      setOpenId(id);
    },
    [didMove],
  );

  const seedOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of players) map.set(p.id, p.seed);
    return (id: string | null) => (id ? (map.get(id) ?? null) : null);
  }, [players]);

  // One pass over matches: group by round and pre-resolve names / seeds / flags.
  // The bronze match shares the final's round, so it is pulled out separately.
  const { rounds, bronze } = useMemo(() => {
    const map = new Map<number, CardProps[]>();
    let bronzeCard: CardProps | null = null;
    const toCard = (m: Match): CardProps => {
      const name1 = playerName(m.p1);
      const name2 = playerName(m.p2);
      return {
        match: m,
        name1,
        name2,
        seed1: seedOf(m.p1),
        seed2: seedOf(m.p2),
        mine1: isSameName(name1, joinedName),
        mine2: isSameName(name2, joinedName),
        onOpen,
      };
    };
    for (const m of matches) {
      const card = toCard(m);
      if (m.kind === "third") {
        bronzeCard = card;
        continue;
      }
      const list = map.get(m.round);
      if (list) list.push(card);
      else map.set(m.round, [card]);
    }
    return {
      bronze: bronzeCard,
      rounds: [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([round, cards]) => ({ round, label: roundName(round), cards })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, joinedName, onOpen, seedOf]);

  // A preliminary round holds fewer bouts than a full round, so it is laid out
  // against the cards it feeds instead of the halving rule used everywhere else.
  const prelimRound = useMemo(() => {
    if (rounds.length < 2) return null;
    return rounds[0].cards.length !== rounds[1].cards.length * 2 ? rounds[0] : null;
  }, [rounds]);

  // Mirrored layout: the draw is split evenly to the left and right of the
  // final, which keeps the tree far narrower on a phone screen.
  const layout = useMemo(() => {
    const main = prelimRound ? rounds.slice(1) : rounds;
    if (main.length < 2) return null;
    const body = main.slice(0, -1);
    const final = main[main.length - 1];
    const half = (cards: CardProps[]) => Math.ceil(cards.length / 2);
    const left = body.map((r) => ({ ...r, cards: r.cards.slice(0, half(r.cards)) }));
    const rightOuter = body.map((r) => ({ ...r, cards: r.cards.slice(half(r.cards)) }));
    const right = [...rightOuter].reverse();
    // The bronze match hangs under the final, so keep room for it.
    const height = Math.max(
      PITCH * Math.max(1, left[0].cards.length, rightOuter[0].cards.length),
      bronze ? PITCH * 4 : 0,
    );
    // ys indexed the same way as `left` / `rightOuter` (outermost round first).
    const leftYs = halfPositions(
      left.map((r) => r.cards.length),
      height,
    );
    const rightYs = halfPositions(
      rightOuter.map((r) => r.cards.length),
      height,
    );

    // Prelim cards sit next to their target bout; siblings feeding the same
    // bout are spread symmetrically around it.
    const split = half(body[0].cards);
    const prelimLeft: { card: CardProps; y: number; targetY: number }[] = [];
    const prelimRight: { card: CardProps; y: number; targetY: number }[] = [];
    if (prelimRound) {
      const groups = new Map<string, CardProps[]>();
      for (const c of prelimRound.cards) {
        const key = c.match.nextMatchId ?? c.match.id;
        const list = groups.get(key);
        if (list) list.push(c);
        else groups.set(key, [c]);
      }
      for (const [targetId, list] of groups) {
        const gi = body[0].cards.findIndex((c) => c.match.id === targetId);
        if (gi < 0) continue;
        const isLeft = gi < split;
        const targetY = isLeft ? (leftYs[0]?.[gi] ?? height / 2) : (rightYs[0]?.[gi - split] ?? height / 2);
        list.forEach((card, k) => {
          const y = targetY + (k - (list.length - 1) / 2) * PITCH;
          (isLeft ? prelimLeft : prelimRight).push({ card, y, targetY });
        });
      }
      prelimLeft.sort((a, b) => a.y - b.y);
      prelimRight.sort((a, b) => a.y - b.y);
    }

    return {
      left,
      right,
      final,
      height,
      leftYs,
      rightYs,
      finalY: height / 2,
      prelimLabel: prelimRound?.label ?? "",
      prelimLeft,
      prelimRight,
    };
  }, [rounds, prelimRound]);

  const flatHeight = PITCH * Math.max(1, rounds[0]?.cards.length ?? 1);
  const flatYs = useMemo(
    () =>
      halfPositions(
        rounds.map((r) => r.cards.length),
        flatHeight,
      ),
    [rounds, flatHeight],
  );


  // Fit the whole tree into the viewport whenever its shape changes.
  useEffect(() => {
    const id = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(id);
  }, [fit, rounds.length, layout?.height, flatHeight]);

  if (!matches.length) {
    return <p className="panel p-4 text-sm text-muted-foreground">尚未產生賽程樹狀圖。</p>;
  }

  const height = layout?.height ?? flatHeight;

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
        style={{
          touchAction: "none",
          cursor: "grab",
          isolation: "isolate",
          transform: "translateZ(0)",
        }}
      >
        <div
          ref={contentRef}
          className="flex items-start p-3"
          style={{
            transformOrigin: "0 0",
            width: "max-content",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "translate3d(0,0,0)",
          }}
        >
          {layout ? (
            <>
              {layout.prelimLeft.length > 0 && (
                <div className="flex">
                  <Column
                    label={layout.prelimLabel}
                    cards={layout.prelimLeft.map((p) => p.card)}
                    ys={layout.prelimLeft.map((p) => p.y)}
                    height={height}
                    align="left"
                  />
                  <PrelimLinks
                    pairs={layout.prelimLeft.map((p) => ({ from: p.y, to: p.targetY }))}
                    height={height}
                    mirror={false}
                  />
                </div>
              )}
              {layout.left.map((r, i) => (

                <div key={`l${r.round}`} className="flex">
                  <Column
                    label={r.label}
                    cards={r.cards}
                    ys={layout.leftYs[i] ?? []}
                    height={height}
                    align="left"
                  />
                  {i < layout.left.length - 1 ? (
                    <Connectors
                      fromYs={layout.leftYs[i] ?? []}
                      toYs={layout.leftYs[i + 1] ?? []}
                      height={height}
                      mirror={false}
                    />
                  ) : (
                    <FinalLink
                      from={layout.leftYs[i]?.[0] ?? layout.finalY}
                      to={layout.finalY}
                      height={height}
                      mirror={false}
                    />
                  )}
                </div>
              ))}

              <Column
                label={layout.final.label}
                cards={layout.final.cards}
                ys={[layout.finalY]}
                height={height}
                align="center"
              />

              {layout.right.map((r, i) => {
                const ri = layout.right.length - 1 - i;
                return (
                  <div key={`r${r.round}`} className="flex">
                    {i === 0 ? (
                      <FinalLink
                        from={layout.rightYs[ri]?.[0] ?? layout.finalY}
                        to={layout.finalY}
                        height={height}
                        mirror
                      />
                    ) : (
                      <Connectors
                        fromYs={layout.rightYs[ri] ?? []}
                        toYs={layout.rightYs[ri + 1] ?? []}
                        height={height}
                        mirror
                      />
                    )}
                    <Column
                      label={r.label}
                      cards={r.cards}
                      ys={layout.rightYs[ri] ?? []}
                      height={height}
                      align="right"
                    />
                  </div>
                );
              })}
              {layout.prelimRight.length > 0 && (
                <div className="flex">
                  <PrelimLinks
                    pairs={layout.prelimRight.map((p) => ({ from: p.y, to: p.targetY }))}
                    height={height}
                    mirror
                  />
                  <Column
                    label={layout.prelimLabel}
                    cards={layout.prelimRight.map((p) => p.card)}
                    ys={layout.prelimRight.map((p) => p.y)}
                    height={height}
                    align="right"
                  />
                </div>
              )}
            </>

          ) : (
            rounds.map((r, i) => (
              <Column
                key={r.round}
                label={r.label}
                cards={r.cards}
                // A one-round draw (single final) is centred like the mirrored
                // layout instead of hugging the top-left corner.
                ys={rounds.length === 1 ? [height / 2] : (flatYs[i] ?? [])}
                height={height}
                align={rounds.length === 1 ? "center" : "left"}
              />
            ))
          )}
        </div>
        <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-secondary/80 px-2 py-0.5 text-[10px] tracking-widest text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        可雙指縮放、拖曳移動，雙擊快速放大；點擊已完成的比賽可查看歷程。賽程以決賽為中心左右對稱分佈。
      </p>
      {openMatch && <MatchHistoryModal match={openMatch} onClose={() => setOpenId(null)} />}
    </div>
  );
}
