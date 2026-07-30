import { useCallback, useEffect, useState } from "react";
import { History, Trophy, Play, Trash2, Download } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { listTournaments, deleteTournament, type TournamentRow } from "@/lib/tournaments";
import {
  buildTournamentReport,
  downloadText,
  reportFileName,
} from "@/lib/tournament-export";
import { useTournament } from "@/lib/tournament-store";


export function TournamentHistory() {
  const { currentAdmin, currentTournament, resumeTournament } = useTournament();
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

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

  const remove = useCallback(async (row: TournamentRow) => {
    if (!window.confirm(`確定刪除「${row.name}」？此動作無法復原，報名紀錄也會一併刪除。`)) return;
    setBusy(row.id);
    setErr("");
    try {
      await deleteTournament(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "刪除失敗");
    }
    setBusy(null);
  }, []);

  const exportTxt = useCallback((row: TournamentRow) => {
    try {
      downloadText(reportFileName(row), buildTournamentReport(row));
      toast.success("已匯出賽事紀錄");
    } catch {
      toast.error("匯出失敗");
    }
  }, []);

  if (!currentAdmin) return null;


  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <History className="h-4 w-4" /> 過往比賽 HISTORY
      </h2>
      {err && <p className="text-xs text-destructive">{err}</p>}
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
              <div className="flex items-center gap-2">
                {r.status === "open" ? (
                  <button
                    onClick={() => void resumeTournament(r.code)}
                    disabled={currentTournament?.code === r.code}
                    className="flex h-10 items-center gap-1 rounded-lg border border-primary/60 px-3 text-xs text-primary disabled:opacity-40"
                  >
                    <Play className="h-4 w-4" />
                    {currentTournament?.code === r.code ? "使用中" : "進入賽事"}
                  </button>
                ) : (
                  <Link
                    to="/results/$code"
                    params={{ code: r.code }}
                    className="flex h-10 items-center gap-1 rounded-lg border border-primary/60 px-3 text-xs text-primary"
                  >
                    <Trophy className="h-4 w-4" /> 成績
                  </Link>
                )}
                <button
                  aria-label="匯出賽事紀錄"
                  title="匯出 .txt"
                  onClick={() => exportTxt(r)}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-border text-muted-foreground"
                >
                  <Download className="h-4 w-4" />
                </button>

                {currentAdmin.isSuper && (
                  <button
                    aria-label="刪除賽事"
                    onClick={() => void remove(r)}
                    disabled={busy === r.id || currentTournament?.id === r.id}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-destructive/60 text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">尚無賽事紀錄。</p>
      )}
      {currentAdmin.isSuper && (
        <p className="text-[11px] text-muted-foreground">
          使用中的賽事無法刪除，請先結束賽事。
        </p>
      )}
    </div>
  );
}
