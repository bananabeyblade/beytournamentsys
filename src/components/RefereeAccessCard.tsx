import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, QrCode, RefreshCw, ShieldCheck, UserRoundCheck, X } from "lucide-react";
import QRCode from "qrcode";
import { useTournament } from "@/lib/tournament-store";
import {
  decideReferee,
  loadRefereeAccess,
  saveRefereeInvite,
  type RefereeAccessState,
  type RefereeStatus,
} from "@/lib/referee-access";

export function RefereeAccessCard() {
  const { currentTournament, currentAdmin } = useTournament();
  const [state, setState] = useState<RefereeAccessState>({ invite: null, referees: [] });
  const [quota, setQuota] = useState(3);
  const [joinUrl, setJoinUrl] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!currentTournament || !currentAdmin || currentAdmin.isReferee) return;
    try {
      const next = await loadRefereeAccess(currentTournament.id);
      setState(next);
      if (next.invite) setQuota(next.invite.quota);
    } catch {
      setError("無法讀取裁判名單");
    }
  }, [currentAdmin, currentTournament]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!joinUrl) return setQr("");
    void QRCode.toDataURL(joinUrl, { width: 640, margin: 2 }).then(setQr);
  }, [joinUrl]);

  const approved = useMemo(
    () => state.referees.filter((item) => item.status === "approved"),
    [state.referees],
  );
  const pending = useMemo(
    () => state.referees.filter((item) => item.status === "pending"),
    [state.referees],
  );

  if (!currentTournament || currentTournament.status !== "open" || currentAdmin?.isReferee)
    return null;

  const save = async (rotate: boolean) => {
    setBusy(true);
    setError("");
    try {
      const result = await saveRefereeInvite(currentTournament.id, quota, rotate);
      if (result.joinPath) setJoinUrl(`${window.location.origin}${result.joinPath}`);
      await load();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setError(
        code === "REFEREE_QUOTA_BELOW_APPROVED"
          ? "名額不能低於目前已核准的裁判人數；請先撤銷多出的裁判。"
          : "裁判邀請設定失敗，請稍後再試。",
      );
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, decision: RefereeStatus) => {
    setBusy(true);
    setError("");
    try {
      await decideReferee(id, decision);
      await load();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setError(code === "REFEREE_QUOTA_FULL" ? "裁判名額已滿。" : "裁判核准失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <ShieldCheck className="h-4 w-4" /> 單場裁判 REFEREES
      </h2>
      <p className="text-xs text-muted-foreground">
        QR Code 僅適用於「{currentTournament.name}」。裁判送出申請後，須由管理者核准才能計分。
      </p>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <span className="text-sm">裁判名額</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQuota(Math.max(1, quota - 1))}
            className="h-10 w-10 rounded-lg border border-border bg-secondary"
          >
            −
          </button>
          <span className="w-8 text-center font-display text-xl text-primary">{quota}</span>
          <button
            onClick={() => setQuota(Math.min(32, quota + 1))}
            className="h-10 w-10 rounded-lg border border-border bg-secondary"
          >
            +
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={() => void save(false)}
          className="min-h-12 rounded-xl border border-primary/60 text-primary disabled:opacity-40"
        >
          儲存名額
        </button>
        <button
          disabled={busy}
          onClick={() => void save(true)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-2 font-display text-primary-foreground disabled:opacity-40"
        >
          <QrCode className="h-4 w-4" /> {state.invite ? "重發裁判 QR" : "產生裁判 QR"}
        </button>
      </div>
      {qr && (
        <div className="space-y-2 rounded-xl border border-primary/50 bg-white p-3 text-center text-black">
          <img
            src={qr}
            alt="本場裁判加入 QR Code"
            className="mx-auto aspect-square w-full max-w-64"
          />
          <p className="break-all text-[10px]">{joinUrl}</p>
        </div>
      )}
      {state.invite && !qr && (
        <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
          邀請已建立。基於安全考量，重新整理後不會顯示舊密鑰；需要 QR Code 時請按「重發裁判 QR」。
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm">待核准 ({pending.length})</p>
        {pending.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-border p-3"
          >
            <span className="min-w-0 truncate text-sm">{item.display_name}</span>
            <div className="flex gap-2">
              <button
                disabled={busy || approved.length >= quota}
                onClick={() => void decide(item.id, "approved")}
                aria-label="核准裁判"
                className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                disabled={busy}
                onClick={() => void decide(item.id, "rejected")}
                aria-label="拒絕裁判"
                className="grid h-10 w-10 place-items-center rounded-lg border border-destructive/60 text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {!pending.length && <p className="text-xs text-muted-foreground">目前沒有待核准申請。</p>}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm">
          <UserRoundCheck className="h-4 w-4 text-primary" /> 已核准 ({approved.length}/{quota})
        </p>
        {approved.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 p-3"
          >
            <span className="min-w-0 truncate text-sm text-primary">{item.display_name}</span>
            <button
              disabled={busy}
              onClick={() => void decide(item.id, "revoked")}
              className="min-h-10 rounded-lg border border-destructive/60 px-3 text-xs text-destructive"
            >
              撤銷
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        disabled={busy}
        onClick={() => void load()}
        className="flex min-h-10 w-full items-center justify-center gap-2 text-xs text-muted-foreground"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> 重新整理裁判名單
      </button>
    </section>
  );
}
