import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserPlus, Check, AlertTriangle, KeyRound } from "lucide-react";
import { addRegistration, claimParticipantRecoveryCode, isNameTaken } from "@/lib/registration";
import { fetchTournamentByCode, type TournamentRow } from "@/lib/tournaments";
import { supabase } from "@/integrations/supabase/client";
import { railwayAuthEnabled } from "@/lib/railway-api";
import { RECONNECT_EVENT } from "@/hooks/use-connection";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { DeckRegistrationPanel } from "@/components/DeckRegistrationPanel";
import {
  clearJoinedRegistration,
  readJoinedNameForTournament,
  writeJoinedName,
  writeJoinedTournamentCode,
} from "@/lib/joined-name";

/** Name this device registered with, used to detect a rejected sign-up. */
const readJoined = (code: string) => readJoinedNameForTournament(code);
const hasGeneratedBracket = (row: TournamentRow) =>
  Array.isArray(row.live_state?.matches) && row.live_state.matches.length > 0;

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === "string" ? search.t : "",
  }),
  head: () => ({
    meta: [
      { title: "掃碼報名 | Beyblade X 賽事系統" },
      {
        name: "description",
        content:
          "掃描賽事 QR Code 後填寫名稱即可完成 Beyblade X 賽事報名，由裁判審核加入選手名單。",
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

function RegisterPage() {
  const { t: code } = Route.useSearch();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [participantCredential, setParticipantCredential] = useState("");
  const [joinedParticipantName, setJoinedParticipantName] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Remember the scanned event so a refresh keeps the waiting screen.
  useEffect(() => {
    if (!code) return;
    if (readJoined(code)) setDone(true);
  }, [code]);

  // Once the referee starts the event, viewers jump straight to the live
  // screen — pushed instantly by realtime, with polling as a fallback.
  // The same check also notices a sign-up the referee rejected, so nobody is
  // left staring at the waiting screen forever.
  useEffect(() => {
    if (!done || !code) return;
    let alive = true;
    const check = async () => {
      const row = await fetchTournamentByCode(code).catch(() => null);
      if (!alive || !row) return;
      // A roster snapshot exists before the bracket is generated. Only enter
      // the live view when matches exist, and keep a newly issued recovery
      // code visible until the participant confirms it has been saved.
      if (hasGeneratedBracket(row)) {
        if (!recoveryCode) void navigate({ to: "/watch/$code", params: { code } });
        return;
      }
      // Nothing published yet: if the sign-up row is gone, it was rejected
      // (an approved player would already appear in a published roster).
      const joined = readJoined(code);
      if (!joined) return;
      const approved = row.live_state?.players.some((player) => {
        const value = player as { name?: unknown };
        return (
          typeof value.name === "string" &&
          value.name.trim().toLowerCase() === joined.trim().toLowerCase()
        );
      });
      if (approved) return;
      const stillPending = await isNameTaken(row.id, joined).catch(() => true);
      if (!alive || stillPending) return;

      clearJoinedRegistration();
      setErr("報名未被裁判保留，請重新報名。");
      setDone(false);
    };
    void check();
    const timer = setInterval(check, railwayAuthEnabled ? 2500 : 20000);
    const channel = railwayAuthEnabled
      ? null
      : supabase
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
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener(RECONNECT_EVENT, onBack);
    };
  }, [done, code, navigate, recoveryCode]);

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
      const generatedCode = await addRegistration(tournament.id, name);
      setName("");
      setRecoveryCode(generatedCode);
      setParticipantCredential(generatedCode);
      setJoinedParticipantName(joinedName);
      writeJoinedTournamentCode(tournament.code);
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

  const recover = async () => {
    if (!tournament) return;
    setBusy(true);
    setErr(null);
    try {
      const recovered = await claimParticipantRecoveryCode(tournament.id, name, recoveryCode);
      if (!recovered) {
        setErr("參賽名稱或 8 碼驗證碼不正確。");
        return;
      }
      writeJoinedTournamentCode(tournament.code);
      const recoveredName = name.trim();
      writeJoinedName(recoveredName);
      setParticipantCredential(recoveryCode.trim());
      setJoinedParticipantName(recoveredName);
      setRecoveryCode("");
      setDone(true);
    } catch {
      setErr("無法找回參賽身分，請確認網路後再試一次。");
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
          <div className="mt-1 flex items-center gap-2">
            {tournament.logo_url && (
              <img
                src={tournament.logo_url}
                alt={`${tournament.name} logo`}
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            )}
            <p className="text-sm text-primary">
              {tournament.name} · {tournament.code}
            </p>
          </div>
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
          {recoveryCode && (
            <div className="rounded-xl border border-primary/60 bg-accent/30 p-3">
              <p className="flex items-center justify-center gap-2 text-sm text-primary">
                <KeyRound className="h-4 w-4" /> 你的參賽者驗證碼
              </p>
              <p className="mt-1 font-display text-3xl tracking-[0.32em] text-primary">
                {recoveryCode}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                請立即截圖保存。若重新整理、換瀏覽器或失去連線，可用此碼找回參賽身分。
              </p>
              <button
                type="button"
                onClick={() => setRecoveryCode("")}
                className="mt-3 min-h-12 w-full rounded-xl bg-primary px-4 font-display text-primary-foreground"
              >
                我已截圖保存驗證碼
              </button>
            </div>
          )}
          {railwayAuthEnabled && participantCredential && joinedParticipantName && tournament && (
            <DeckRegistrationPanel
              tournamentId={tournament.id}
              participantName={joinedParticipantName}
              recoveryCode={participantCredential}
            />
          )}
          <button
            onClick={() => {
              setName("");
              setParticipantCredential("");
              setJoinedParticipantName("");
              clearJoinedRegistration();

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
          <button
            type="button"
            onClick={() => {
              setShowRecovery((value) => !value);
              setErr(null);
              setRecoveryCode("");
            }}
            className="min-h-11 w-full rounded-xl border border-primary/60 bg-accent/20 text-sm text-primary"
          >
            {showRecovery ? "我要新報名" : "已有驗證碼？找回我的參賽身分"}
          </button>
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
          {showRecovery && (
            <input
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              autoComplete="one-time-code"
              placeholder="輸入 8 碼驗證碼"
              className="min-h-14 w-full rounded-xl border border-input bg-input/40 px-3 font-display tracking-[0.2em] outline-none focus:border-primary"
            />
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button
            disabled={!name.trim() || busy || (showRecovery && recoveryCode.length !== 8)}
            onClick={() => void (showRecovery ? recover() : submit())}
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
