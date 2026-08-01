import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, RefreshCw } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { listAuditLogFn } from "@/lib/audit.functions";
import { AUDIT_LABELS, describeEntry, type AuditEntry } from "@/lib/audit";

function stamp(iso: string) {
  return new Date(iso).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Owner-only audit trail: who changed what, and when. */
export function AuditLogCard() {
  const { isOwner } = useTournament();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [action, setAction] = useState("");
  const [tour, setTour] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const data = await listAuditLogFn({
        data: {
          limit: 200,
          ...(action ? { action } : {}),
          ...(tour ? { tournamentName: tour } : {}),
        },
      });
      setRows(data as unknown as AuditEntry[]);
    } catch {
      setErr("無法讀取操作紀錄");
    }
    setBusy(false);
  }, [action, tour]);

  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner, load]);

  const tournaments = useMemo(
    () => [...new Set(rows.map((r) => r.tournament_name).filter(Boolean))] as string[],
    [rows],
  );

  if (!isOwner) return null;

  const exportTxt = () => {
    const body = [
      "管理者操作紀錄 ADMIN AUDIT LOG",
      `匯出時間：${new Date().toLocaleString("zh-TW")}`,
      "",
      ...rows.map(
        (r) =>
          `[${stamp(r.created_at)}] ${r.actor_email ?? "未知帳號"} · ${describeEntry(r)}${
            r.tournament_name ? ` · 賽事：${r.tournament_name}` : ""
          }`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `beyx-audit-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
          <ClipboardList className="h-4 w-4" /> 操作紀錄 AUDIT LOG
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={busy}
            aria-label="重新整理"
            className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={exportTxt}
            disabled={!rows.length}
            aria-label="匯出 txt"
            className="grid h-10 w-10 place-items-center rounded-lg border border-primary/50 bg-accent/30 text-primary disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="min-h-11 rounded-xl border border-input bg-input/40 px-2 text-sm"
        >
          <option value="">全部動作</option>
          {Object.entries(AUDIT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={tour}
          onChange={(e) => setTour(e.target.value)}
          className="min-h-11 rounded-xl border border-input bg-input/40 px-2 text-sm"
        >
          <option value="">全部賽事</option>
          {tournaments.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}
      {!err && !rows.length && !busy && (
        <p className="text-xs text-muted-foreground">目前沒有紀錄。</p>
      )}

      <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {rows.map((r) => (
          <li key={r.id} className="px-3 py-2 text-xs">
            <p className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="truncate text-primary">{r.actor_email ?? "未知帳號"}</span>
              <span className="shrink-0">{stamp(r.created_at)}</span>
            </p>
            <p className="mt-0.5 break-words">{describeEntry(r)}</p>
            {r.tournament_name && (
              <p className="text-[11px] text-muted-foreground">賽事：{r.tournament_name}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        僅擁有者可查看，最多顯示最近 200 筆；紀錄無法從前端讀取或修改。
      </p>
    </div>
  );
}
