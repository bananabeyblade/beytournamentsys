import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Users, QrCode, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { useTournament } from "@/lib/tournament-store";
import {
  fetchRegistrations,
  deleteRegistration,
  deleteRegistrations,
  type Registration,
} from "@/lib/registration";
import { supabase } from "@/integrations/supabase/client";

/** Coalescing window for bursts of sign-ups (e.g. 64 phones scanning at once). */
const REFRESH_THROTTLE_MS = 1000;
/** Sign-ups cleared per request when approving the whole waiting list. */
const APPROVE_BATCH = 25;


export function PlayersTab() {
  const { players, addPlayers, removePlayer, role, currentAdmin, currentTournament, rosterLocked } =
    useTournament();
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  const [pending, setPending] = useState<Registration[]>([]);
  const [busy, setBusy] = useState(false);
  const tournamentId = currentTournament?.id ?? null;
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    if (!currentAdmin || !tournamentId) {
      setPending([]);
      return;
    }
    let alive = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      fetchRegistrations(tournamentId)
        .then((list) => alive && setPending(list))
        .catch(() => undefined);
    };
    // Merge rapid realtime events into a single refetch.
    const throttledSync = () => {
      if (timeout) return;
      timeout = setTimeout(() => {
        timeout = undefined;
        sync();
      }, REFRESH_THROTTLE_MS);
    };
    sync();
    const channel = supabase
      .channel(`registrations-${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "registrations",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        throttledSync,
      )
      .subscribe();
    const timer = window.setInterval(sync, 10000);
    return () => {
      alive = false;
      if (timeout) clearTimeout(timeout);
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [currentAdmin, tournamentId]);

  /** Names not already on the roster (case/space insensitive). */
  const newNames = (names: string[]) => {
    const have = new Set(playersRef.current.map((p) => p.name.trim().toLowerCase()));
    const out: string[] = [];
    for (const n of names) {
      const key = n.trim().toLowerCase();
      if (!key || have.has(key)) continue;
      have.add(key);
      out.push(n.trim());
    }
    return out;
  };

  // Delete first, add second: a failed delete leaves the entry pending instead
  // of letting the next sync resurrect it and double-add the player.
  const resolve = async (id: string, accept: boolean) => {
    const item = pending.find((r) => r.id === id);
    if (!currentAdmin || !item || busy || rosterLocked) return;
    setBusy(true);
    try {
      await deleteRegistration(id);
      setPending((prev) => prev.filter((r) => r.id !== id));
      if (accept) addPlayers(newNames([item.name]));
    } catch {
      toast.error("處理失敗，請確認網路後再試一次");
    } finally {
      setBusy(false);
    }
  };

  /** One roster update + one cloud publish for the whole waiting list. */
  const approveAll = async () => {
    if (!currentAdmin || busy || !pending.length || rosterLocked) return;
    setBusy(true);
    const list = [...pending];
    const accepted: string[] = [];
    const failed: Registration[] = [];
    // Batched deletes: 64 sign-ups become 3 requests instead of 64 round trips.
    for (let i = 0; i < list.length; i += APPROVE_BATCH) {
      const chunk = list.slice(i, i + APPROVE_BATCH);
      try {
        await deleteRegistrations(chunk.map((r) => r.id));
        accepted.push(...chunk.map((r) => r.name));
      } catch {
        failed.push(...chunk);
      }
    }
    if (accepted.length) addPlayers(newNames(accepted));
    setPending(failed);
    if (failed.length) toast.error(`${failed.length} 筆核准失敗，請再試一次`);
    else toast.success(`已核准 ${accepted.length} 位選手`);
    setBusy(false);
  };



  return (
    <div className="space-y-4">
      {role === "admin" && (
        <div className="panel space-y-3 p-3">
          <h2 className="text-sm tracking-widest text-muted-foreground">新增選手 ADD PLAYER</h2>
          <div className="flex gap-2">
            <input
              value={single}
              disabled={rosterLocked}
              onChange={(e) => setSingle(e.target.value)}
              placeholder="選手名稱"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
            />
            <button
              disabled={rosterLocked}
              onClick={() => {
                addPlayers(newNames([single]));
                setSingle("");
              }}
              className="grid min-h-12 w-14 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <textarea
            value={bulk}
            disabled={rosterLocked}
            onChange={(e) => setBulk(e.target.value)}
            rows={4}
            placeholder={"批次新增：一行一位選手\n例如：\n阿翔\n小凱"}
            className="w-full rounded-xl border border-input bg-input/40 p-3 text-sm outline-none focus:border-primary"
          />
          <button
            disabled={rosterLocked}
            onClick={() => {
              addPlayers(newNames(bulk.split("\n")));
              setBulk("");
            }}
            className="min-h-12 w-full rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
          >
            批次匯入 BULK ADD
          </button>
        </div>
      )}

      {role === "admin" && pending.length > 0 && (
        <div className="panel p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
            <QrCode className="h-4 w-4" /> 掃碼報名待審核 ({pending.length})
          </h2>
          <button
            onClick={approveAll}
            disabled={busy || rosterLocked}
            className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
          >
            <CheckCheck className="h-5 w-5" />
            {busy ? "處理中…" : `全部核准 (${pending.length})`}
          </button>
          <ul className="space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-primary/40 bg-accent/20 px-3 py-2"
              >
                <span className="truncate">{r.name}</span>
                <button
                  aria-label={`加入 ${r.name}`}
                  disabled={busy || rosterLocked}
                  onClick={() => resolve(r.id, true)}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-primary/60 text-primary disabled:opacity-40"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  aria-label={`拒絕 ${r.name}`}
                  disabled={busy || rosterLocked}
                  onClick={() => resolve(r.id, false)}
                  className="grid h-10 w-10 place-items-center rounded-lg text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-5 w-5" />
                </button>

              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel p-3">
        <h2 className="mb-2 flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
          <Users className="h-4 w-4" /> 選手名單 ({players.length})
        </h2>
        {players.length ? (
          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary/40 font-display text-xs text-primary">
                  {p.seed}
                </span>
                <span className="truncate">{p.name}</span>
                {role === "admin" && (
                  <button
                    aria-label={`移除 ${p.name}`}
                    disabled={rosterLocked}
                    onClick={() => removePlayer(p.id)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-destructive"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">尚未有選手報名。</p>
        )}
      </div>
      {role === "admin" && rosterLocked && (
        <p className="rounded-xl border border-primary/50 bg-accent/20 p-3 text-xs text-primary">
          賽程已產生，選手名單與待審核報名已鎖定；如需修改，請由總管理者重置賽事後再操作。
        </p>
      )}
    </div>
  );
}
