import { Check, Loader2, RefreshCw, CloudOff } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";

function clock(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Admin-only badge telling the referee whether the bracket actually reached the
 * cloud — with a retry when a push failed.
 */
export function SyncStatusBadge() {
  const { role, spectator, currentTournament, syncStatus, lastSyncedAt, retrySync } =
    useTournament();

  if (spectator || role !== "admin" || !currentTournament) return null;

  const failed = syncStatus === "error";
  const syncing = syncStatus === "syncing";

  return (
    <div className="flex items-center gap-2">
      <span
        role="status"
        className={`flex h-11 w-[5.5rem] items-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold ${
          failed
            ? "border-destructive/70 bg-destructive/15 text-destructive"
            : syncing
              ? "border-burst/60 bg-burst/15 text-burst"
              : "border-primary/50 bg-accent/30 text-primary"
        }`}
      >
        {failed ? (
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
        ) : syncing ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="flex min-w-0 flex-col items-start leading-none">
          <span className="whitespace-nowrap">
            {failed ? "同步失敗" : syncing ? "正在同步" : "已同步"}
          </span>
          {!failed && !syncing && lastSyncedAt && (
            <span className="mt-1 whitespace-nowrap text-[9px] font-medium opacity-75">
              {clock(lastSyncedAt)}
            </span>
          )}
        </span>
      </span>
      {failed && (
        <button
          onClick={retrySync}
          className="flex h-9 items-center gap-1 rounded-lg border border-primary/60 bg-accent/40 px-2 text-[11px] font-bold text-primary"
        >
          <RefreshCw className="h-3.5 w-3.5" /> 重試
        </button>
      )}
    </div>
  );
}
