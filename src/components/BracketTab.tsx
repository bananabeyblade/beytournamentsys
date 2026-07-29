import { useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { MatchHistoryModal } from "./MatchHistoryModal";

export function BracketTab() {
  const { matches, playerName, roundName } = useTournament();
  const [zoom, setZoom] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const openMatch = matches.find((m) => m.id === openId) ?? null;

  if (!matches.length) {
    return <p className="panel p-4 text-sm text-muted-foreground">尚未產生賽程樹狀圖。</p>;
  }

  const rounds = Array.from(new Set(matches.map((m) => m.round))).sort((a, b) => a - b);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm tracking-widest text-muted-foreground">賽程樹狀圖 BRACKET</h2>
        <div className="flex gap-2">
          <button
            aria-label="縮小"
            onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
            className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-secondary"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            aria-label="放大"
            onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))}
            className="grid h-11 w-11 place-items-center rounded-lg border border-border bg-secondary"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="panel overflow-auto p-3">
        <div
          className="flex gap-6"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: "max-content" }}
        >
          {rounds.map((r) => (
            <div key={r} className="flex min-w-56 flex-col justify-around gap-4">
              <p className="font-display text-xs tracking-widest text-primary">{roundName(r)}</p>
              {matches
                .filter((m) => m.round === r)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={m.status !== "done"}
                    onClick={() => setOpenId(m.id)}
                    className={`w-full rounded-lg border p-2 text-left ${
                      m.status === "live"
                        ? "danger-edge border-danger/60 bg-danger/10"
                        : m.status === "done"
                          ? "border-primary/40 bg-accent/20"
                          : "border-border bg-secondary/40"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[10px] tracking-widest">
                      <span className="text-muted-foreground">M{m.index + 1}</span>
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
                      return (
                        <div
                          key={s}
                          className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                            isWinner ? "bg-primary/20 font-bold text-primary" : ""
                          }`}
                        >
                          <span className="truncate">{playerName(pid)}</span>
                          <span className="font-display shrink-0">
                            {s === 1 ? m.score1 : m.score2}
                          </span>
                        </div>
                      );
                    })}
                    {m.status === "done" && (
                      <p className="mt-1 text-center text-[10px] tracking-widest text-primary/70">
                        點擊查看比賽歷程
                      </p>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        可左右滑動與縮放檢視完整賽程，點擊已完成的比賽可查看歷程。
      </p>
      {openMatch && <MatchHistoryModal match={openMatch} onClose={() => setOpenId(null)} />}
    </div>
  );
}
