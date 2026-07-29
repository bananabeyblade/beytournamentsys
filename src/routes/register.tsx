import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserPlus, Check, AlertTriangle } from "lucide-react";
import { addRegistration, isNameTaken } from "@/lib/registration";
import { fetchTournamentByCode, type TournamentRow } from "@/lib/tournaments";
import { supabase } from "@/integrations/supabase/client";
import { RECONNECT_EVENT } from "@/hooks/use-connection";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { writeJoinedName } from "@/lib/joined-name";


export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === "string" ? search.t : "",
  }),
  head: () => ({
    meta: [
      { title: "掃碼報名 | Beyblade X 賽事系統" },
      {
        name: "description",
        content: "掃描賽事 QR Code 後填寫名稱即可完成 Beyblade X 賽事報名，由裁判審核加入選手名單。",
      },
      { property: "og:title", content: "掃碼報名 | Beyblade X 賽事系統" },
      {
        property: "og:description",
        content: "填寫名稱完成 Beyblade X 賽事報名，裁判審核後即進入選手名單。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegisterPage,
});

const JOINED_KEY = "beyx-joined";



function RegisterPage() {
  const { t: code } = Route.useSearch();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Remember the scanned event so a refresh keeps the waiting screen.
  useEffect(() => {
    if (!code || typeof window === "undefined") return;
    if (window.localStorage.getItem(JOINED_KEY) === code) setDone(true);
  }, [code]);

  // Once the referee starts the event, viewers jump straight to the live
  // screen — pushed instantly by realtime, with polling as a fallback.
  useEffect(() => {
    if (!done || !code) return;
    let alive = true;
    const check = async () => {
      const row = await fetchTournamentByCode(code).catch(() => null);
      if (!alive || !row?.live_state) return;
      void navigate({ to: "/watch/$code", params: { code } });
    };
    void check();
    const timer = setInterval(check, 5000);
    const channel = supabase
      .channel(`register-${code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments", filter: `code=eq.${code}` },
        () => void check(),
      )
      .subscribe();
    const onBack = () => void check();
    window.addEventListener(RECONNECT_EVENT, onBack);
    return () => {
      alive = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
      window.removeEventListener(RECONNECT_EVENT, onBack);
    };
  }, [done, code, navigate]);

  useEffect(() => {
    let alive = true;
    if (!code) {
      setLoading(false);
      return;
    }
    fetchTournamentByCode(code)
      .then((row) => alive && setTournament(row))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code]);

  const submit = async () => {
    if (!tournament) return;
    setBusy(true);
    setErr(null);
    try {
      if (await isNameTaken(tournament.id, name)) {
        setErr("這個名稱在本場賽事已經報名過了，請換一個名稱。");
        return;
      }
      const joinedName = name.trim();
      await addRegistration(tournament.id, name);
      setName("");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(JOINED_KEY, tournament.code);
      }
      writeJoinedName(joinedName);

      setDone(true);
    } catch (e) {
      setErr(
        e instanceof Error && e.message === "DUPLICATE"
          ? "這個名稱在本場賽事已經報名過了，請換一個名稱。"
          : "送出失敗，請確認網路後再試一次。",
      );
    } finally {
      setBusy(false);
    }
  };

  const blocked = !loading && (!code || !tournament || tournament.status !== "open");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-8">
      <ConnectionBanner />
      <div>
        <h1 className="font-display text-2xl neon-text">賽事報名</h1>
        <p className="text-[11px] tracking-widest text-muted-foreground">
          BEYBLADE X · PLAYER REGISTRATION
        </p>
        {tournament && (
          <p className="mt-1 text-sm text-primary">
            {tournament.name} · {tournament.code}
          </p>
        )}
      </div>

      {loading ? (
        <div className="panel p-4 text-sm text-muted-foreground">讀取賽事資訊中…</div>
      ) : done ? (
        <div className="panel space-y-3 p-4 text-center">
          <Check className="mx-auto h-10 w-10 text-primary" />
          <p className="font-display text-lg">報名已送出</p>
          <p className="text-sm text-muted-foreground">
            請等待裁判於現場確認加入選手名單，比賽開始後會自動進入賽事畫面。
          </p>
          <p className="text-xs text-primary">等待比賽開始中…</p>
          <button
            onClick={() => {
              setName("");
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(JOINED_KEY);
              }
              writeJoinedName("");

              setDone(false);
            }}
            className="min-h-12 w-full rounded-xl border border-primary/60 bg-accent/40 text-primary"
          >
            再報名一位
          </button>
        </div>
      ) : blocked ? (
        <div className="panel space-y-2 p-4 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <p className="font-display text-lg">無法報名</p>
          <p className="text-sm text-muted-foreground">
            {!code || !tournament
              ? "此 QR Code 已失效，請向裁判索取最新的報名 QR Code。"
              : "本場賽事已結束報名。"}
          </p>
        </div>
      ) : (
        <div className="panel space-y-3 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            name="beyx-player-name"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
            placeholder="選手名稱 / 暱稱"
            className="min-h-14 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button
            disabled={!name.trim() || busy}
            onClick={submit}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
          >
            <UserPlus className="h-5 w-5" /> {busy ? "送出中…" : "送出報名"}
          </button>
          <p className="text-xs text-muted-foreground">
            同一場賽事不可使用重複名稱，送出前系統會自動檢查。
          </p>
        </div>
      )}
    </main>
  );
}
