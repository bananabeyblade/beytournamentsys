import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  CloudOff,
  Database,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { useConnection, useOnReconnect } from "@/hooks/use-connection";
import { systemStatusFn, type SystemStatus } from "@/lib/system-status.functions";

const POLL_MS = 20_000;

function clock(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type Tone = "ok" | "warn" | "bad";

function Row({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: Tone;
}) {
  const toneCls =
    tone === "bad"
      ? "border-destructive/60 bg-destructive/15 text-destructive"
      : tone === "warn"
        ? "border-burst/60 bg-burst/15 text-burst"
        : "border-primary/50 bg-accent/30 text-primary";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold ${toneCls}`}
      >
        {tone === "bad" ? (
          <X className="h-3 w-3" />
        ) : tone === "warn" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        {value}
      </span>
    </div>
  );
}

/**
 * Superadmin-only live health panel: superadmin seat, database, network, sync.
 * Gated again here (not just by the caller) in case this card is ever
 * mounted somewhere a regular referee account can reach.
 */
export function SystemStatusCard() {
  const { role, spectator, currentAdmin, syncStatus, lastSyncedAt, retrySync } = useTournament();
  const { online, justReconnected } = useConnection();

  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const aliveRef = useRef(true);

  const visible = !spectator && role === "admin" && !!currentAdmin?.isSuper;

  const check = useCallback(async () => {
    setBusy(true);
    try {
      const res = await systemStatusFn();
      if (!aliveRef.current) return;
      setStatus(res as SystemStatus);
    } catch {
      if (!aliveRef.current) return;
      setStatus({
        superadminExists: false,
        dbOk: false,
        latencyMs: 0,
        serverTime: Date.now(),
        errorCode: "UNREACHABLE",
      });
    } finally {
      if (aliveRef.current) {
        setCheckedAt(Date.now());
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    void check();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void check();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [visible, check]);

  useOnReconnect(
    useCallback(() => {
      if (visible) void check();
    }, [visible, check]),
  );

  if (!visible) return null;

  const dbTone: Tone = status ? (status.dbOk ? "ok" : "bad") : "warn";
  const dbValue = status
    ? status.dbOk
      ? `正常 ${status.latencyMs}ms`
      : `異常 ${status.errorCode ?? ""}`.trim()
    : "檢查中";

  const superTone: Tone = !status
    ? "warn"
    : !status.dbOk
      ? "bad"
      : status.superadminExists
        ? "ok"
        : "warn";
  const superValue = !status
    ? "檢查中"
    : !status.dbOk
      ? "檢查失敗"
      : status.superadminExists
        ? "已建立"
        : "尚未建立";

  const netTone: Tone = !online ? "bad" : justReconnected ? "warn" : "ok";
  const netValue = !online ? "離線" : justReconnected ? "剛恢復" : "已連線";

  const syncTone: Tone = syncStatus === "error" ? "bad" : syncStatus === "syncing" ? "warn" : "ok";
  const syncValue =
    syncStatus === "error"
      ? "同步失敗"
      : syncStatus === "syncing"
        ? "正在同步"
        : `已同步${lastSyncedAt ? ` ${clock(lastSyncedAt)}` : ""}`;

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
          <Activity className="h-4 w-4 text-primary" /> 系統狀態 SYSTEM STATUS
        </h2>
        <button
          onClick={() => void check()}
          disabled={busy}
          className="flex min-h-9 items-center gap-1 rounded-lg border border-primary/60 bg-accent/40 px-2 text-[11px] font-bold text-primary disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          重新檢查
        </button>
      </div>

      <div className="space-y-2">
        <Row
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="總管理者 SUPERADMIN"
          value={superValue}
          tone={superTone}
        />
        <Row
          icon={<Database className="h-3.5 w-3.5" />}
          label="資料庫 DATABASE"
          value={dbValue}
          tone={dbTone}
        />
        <Row
          icon={online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          label="網路 NETWORK"
          value={netValue}
          tone={netTone}
        />
        <Row
          icon={
            syncStatus === "error" ? (
              <CloudOff className="h-3.5 w-3.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )
          }
          label="即時同步 SYNC"
          value={syncValue}
          tone={syncTone}
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>最後檢查：{checkedAt ? clock(checkedAt) : "—"}</span>
        {syncStatus === "error" && (
          <button
            onClick={retrySync}
            className="flex items-center gap-1 rounded-lg border border-primary/60 bg-accent/40 px-2 py-1 font-bold text-primary"
          >
            <RefreshCw className="h-3 w-3" /> 重試同步
          </button>
        )}
      </div>
    </div>
  );
}
