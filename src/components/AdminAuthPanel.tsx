import { useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export function AdminAuthPanel() {
  const { currentAdmin, signIn, logout } = useTournament();

  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (currentAdmin) {
    return (
      <div className="space-y-4">
        <div className="panel p-3">
          <p className="text-sm">
            已登入：<span className="text-primary">{currentAdmin.email}</span>
            {currentAdmin.isSuper && " · 總管理者"}
          </p>
          <button
            onClick={() => void logout()}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/60 text-destructive"
          >
            <LogOut className="h-4 w-4" /> 登出
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-3">
        <h2 className="text-sm tracking-widest text-muted-foreground">管理者登入 ADMIN LOGIN</h2>
        <input
          value={u}
          onChange={(e) => setU(e.target.value)}
          placeholder="帳號（總管理者請輸入信箱）"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
        <input
          value={p}
          type="password"
          onChange={(e) => setP(e.target.value)}
          placeholder="密碼"
          autoComplete="current-password"
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button
          disabled={busy}
          onClick={async () => {
            if (!u.trim()) {
              setErr("請輸入帳號");
              return;
            }
            if (!p) {
              setErr("請輸入密碼");
              return;
            }
            setBusy(true);
            setErr("");
            const fail = await signIn(u.trim(), p);
            if (fail) setErr(fail);
            setBusy(false);
          }}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" /> 登入
        </button>
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[11px] tracking-widest text-muted-foreground">OR</span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleSignInButton onError={setErr} />

        <p className="text-xs text-muted-foreground">
          帳號權限存放於雲端，核准與刪除報名皆由伺服器驗證身分。
        </p>
      </div>
    </div>
  );
}
