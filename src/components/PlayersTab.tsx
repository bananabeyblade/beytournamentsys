import { useEffect, useState } from "react";
import { Plus, Trash2, Users, QrCode, Check } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { fetchRegistrations, deleteRegistration, type Registration } from "@/lib/registration";
import { supabase } from "@/integrations/supabase/client";

export function PlayersTab() {
  const { players, addPlayers, removePlayer, role, currentAdmin } = useTournament();
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  const [pending, setPending] = useState<Registration[]>([]);

  useEffect(() => {
    let alive = true;
    const sync = () => {
      fetchRegistrations()
        .then((list) => alive && setPending(list))
        .catch(() => undefined);
    };
    sync();
    const channel = supabase
      .channel("registrations-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, sync)
      .subscribe();
    const timer = window.setInterval(sync, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const resolve = async (id: string, accept: boolean) => {
    const item = pending.find((r) => r.id === id);
    if (!currentAdmin) return;
    if (accept && item) addPlayers([item.name]);
    setPending((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteRegistration(id);
    } catch {
      /* 下次同步會還原 */
    }
  };


  return (
    <div className="space-y-4">
      {role === "admin" && (
        <div className="panel space-y-3 p-3">
          <h2 className="text-sm tracking-widest text-muted-foreground">新增選手 ADD PLAYER</h2>
          <div className="flex gap-2">
            <input
              value={single}
              onChange={(e) => setSingle(e.target.value)}
              placeholder="選手名稱"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
            />
            <button
              onClick={() => {
                addPlayers([single]);
                setSingle("");
              }}
              className="grid min-h-12 w-14 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={4}
            placeholder={"批次新增：一行一位選手\n例如：\n阿翔\n小凱"}
            className="w-full rounded-xl border border-input bg-input/40 p-3 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => {
              addPlayers(bulk.split("\n"));
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
          <ul className="space-y-2">
            {pending.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-primary/40 bg-accent/20 px-3 py-2"
              >
                <span className="truncate">{r.name}</span>
                <button
                  aria-label={`加入 ${r.name}`}
                  onClick={() => resolve(r.id, true)}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-primary/60 text-primary"
                >
                  <Check className="h-5 w-5" />
                </button>
                <button
                  aria-label={`拒絕 ${r.name}`}
                  onClick={() => resolve(r.id, false)}
                  className="grid h-10 w-10 place-items-center rounded-lg text-destructive"
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
    </div>
  );
}
