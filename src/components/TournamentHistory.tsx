import { useEffect, useState } from "react";
import { History, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { listTournaments, type TournamentRow } from "@/lib/tournaments";
import { useTournament } from "@/lib/tournament-store";

export function TournamentHistory() {
  const { currentAdmin, currentTournament } = useTournament();
  const [rows, setRows] = useState<TournamentRow[]>([]);

  useEffect(() => {
    if (!currentAdmin) {
      setRows([]);
      return;
    }
    let alive = true;
    listTournaments()
      .then((list) => alive && setRows(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [currentAdmin, currentTournament]);

  if (!currentAdmin) return null;

  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <History className="h-4 w-4" /> 過往比賽 HISTORY
      </h2>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{r.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString("zh-TW")} · {r.code} ·{" "}
                  {r.status === "finished" ? "已結束" : "進行中"}
                </p>
              </div>
              {r.status === "finished" && (
                <Link
                  to="/results/$code"
                  params={{ code: r.code }}
                  className="flex h-10 items-center gap-1 rounded-lg border border-primary/60 px-3 text-xs text-primary"
                >
                  <Trophy className="h-4 w-4" /> 成績
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">尚無賽事紀錄。</p>
      )}
    </div>
  );
}
