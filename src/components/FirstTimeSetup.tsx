import { useEffect, useState } from "react";
import { Check, ChevronRight, Loader2, ShieldCheck } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { superadminExistsFn } from "@/lib/system-client";

type Field = "email" | "password" | "confirm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string, confirm: string) {
  const errs: Partial<Record<Field, string>> = {};
  if (!email.trim()) errs.email = "請輸入登入信箱";
  else if (!EMAIL_RE.test(email.trim())) errs.email = "信箱格式不正確";
  if (!password) errs.password = "請設定密碼";
  else if (password.length < 8) errs.password = "密碼至少需 8 碼";
  if (!confirm) errs.confirm = "請再次輸入密碼";
  else if (confirm !== password) errs.confirm = "兩次輸入的密碼不一致";
  return errs;
}

/**
 * First-run guided setup: only shown when no superadmin exists in the cloud.
 * Walks the referee through creating the very first 總管理者 account.
 */
export function FirstTimeSetup() {
  const { currentAdmin, signUp, claimSuperadmin, signInWithGoogle } = useTournament();
  const [needed, setNeeded] = useState<boolean | null>(null);
  const [step, setStep] = useState(0); // 0 = intro, 1 = form, 2 = done
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    superadminExistsFn()
      .then((r) => alive && setNeeded(!r.exists))
      .catch(() => alive && setNeeded(false));
    return () => {
      alive = false;
    };
  }, [currentAdmin]);

  if (needed === null || needed === false) return null;

  const errs = validate(email, password, confirm);
  const show = (f: Field) => (touched[f] ? errs[f] : undefined);
  const valid = Object.keys(errs).length === 0;

  const submit = async () => {
    setTouched({ email: true, password: true, confirm: true });
    if (!valid) return;
    setBusy(true);
    setErr("");
    const failed = (await signUp(email.trim(), password)) ?? (await claimSuperadmin());
    if (failed) setErr(failed);
    else {
      setStep(2);
      setNeeded(false);
    }
    setBusy(false);
  };

  return (
    <div className="panel space-y-3 border-primary/50 p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="font-display text-sm tracking-widest neon-text">
          首次設定 FIRST-TIME SETUP
        </h2>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {["說明", "建立帳號", "完成"].map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                step >= i ? "border-primary text-primary" : "border-border"
              }`}
            >
              {step > i ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {label}
            {i < 2 && <ChevronRight className="h-3 w-3" />}
          </span>
        ))}
      </div>

      {step === 0 && (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            這台裝置尚未建立總管理者。總管理者可以新增／移除管理者、核准掃碼報名、產生賽程並計分。
            請準備一組常用信箱與至少 8 碼的密碼，稍後可在「我的帳號」隨時修改。
          </p>
          <button
            onClick={async () => {
              setBusy(true);
              setErr("");
              const failed = await signInWithGoogle();
              if (failed) {
                setErr(failed);
                setBusy(false);
              }
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground"
          >
            開始設定 <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <div className="space-y-1">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="登入信箱"
              autoComplete="email"
              inputMode="email"
              className={`min-h-12 w-full rounded-xl border bg-input/40 px-3 outline-none focus:border-primary ${
                show("email") ? "border-destructive" : "border-input"
              }`}
            />
            {show("email") && <p className="text-xs text-destructive">{show("email")}</p>}
          </div>
          <div className="space-y-1">
            <input
              value={password}
              type="password"
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              placeholder="密碼（至少 8 碼）"
              autoComplete="new-password"
              className={`min-h-12 w-full rounded-xl border bg-input/40 px-3 outline-none focus:border-primary ${
                show("password") ? "border-destructive" : "border-input"
              }`}
            />
            {show("password") && <p className="text-xs text-destructive">{show("password")}</p>}
          </div>
          <div className="space-y-1">
            <input
              value={confirm}
              type="password"
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
              placeholder="再次輸入密碼"
              autoComplete="new-password"
              className={`min-h-12 w-full rounded-xl border bg-input/40 px-3 outline-none focus:border-primary ${
                show("confirm") ? "border-destructive" : "border-input"
              }`}
            />
            {show("confirm") && <p className="text-xs text-destructive">{show("confirm")}</p>}
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button
            disabled={busy}
            onClick={() => void submit()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            建立並成為總管理者
          </button>
          <button
            onClick={() => setStep(0)}
            className="min-h-11 w-full text-xs text-muted-foreground"
          >
            返回說明
          </button>
        </>
      )}
    </div>
  );
}
