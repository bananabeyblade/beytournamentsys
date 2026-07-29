import { useState } from "react";
import { LogIn, LogOut, Shuffle, RotateCcw, Shield, Eye } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { AccountSettings } from "./AccountSettings";
import { QrRegisterCard } from "./QrRegisterCard";

export function SettingsTab() {
  const {
    role,
    setRole,
    currentAdmin,
    signIn,
    signUp,
    claimSuperadmin,
    logout,
    tableCount,
    setTableCount,
    generateBracket,
    resetTournament,
    loadSample,
    players,
  } = useTournament();

  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "setup">("signin");


  return (
    <div className="space-y-4">
      <div className="panel p-3">
        <h2 className="mb-2 text-sm tracking-widest text-muted-foreground">
          角色切換 ROLE
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setRole("player")}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border font-display ${
              role === "player" ? "neon-edge bg-accent/40 text-primary" : "border-border bg-secondary"
            }`}
          >
            <Eye className="h-4 w-4" /> 參賽者
          </button>
          <button
            disabled={!currentAdmin}
            onClick={() => setRole("admin")}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border font-display disabled:opacity-40 ${
              role === "admin" ? "neon-edge bg-accent/40 text-primary" : "border-border bg-secondary"
            }`}
          >
            <Shield className="h-4 w-4" /> 管理者
          </button>
        </div>
        {!currentAdmin && (
          <p className="mt-2 text-xs text-muted-foreground">需先登入管理者帳號才可切換。</p>
        )}
      </div>

      {currentAdmin ? (
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
      ) : (
        <div className="panel space-y-3 p-3">
          <h2 className="text-sm tracking-widest text-muted-foreground">
            {mode === "signin" ? "管理者登入 ADMIN LOGIN" : "建立總管理者 SETUP"}
          </h2>
          <input
            value={u}
            onChange={(e) => setU(e.target.value)}
            placeholder="登入信箱"
            autoComplete="email"
            className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />
          <input
            value={p}
            type="password"
            onChange={(e) => setP(e.target.value)}
            placeholder={mode === "signin" ? "密碼" : "密碼（至少 8 碼）"}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              const fail =
                mode === "signin" ? await signIn(u, p) : await signUp(u, p);
              if (fail) {
                setErr(fail);
              } else if (mode === "setup") {
                const claimErr = await claimSuperadmin();
                if (claimErr) setErr(claimErr);
              }
              setBusy(false);
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {mode === "signin" ? "登入" : "建立並成為總管理者"}
          </button>
          <button
            onClick={() => {
              setMode(mode === "signin" ? "setup" : "signin");
              setErr("");
            }}
            className="min-h-11 w-full text-xs text-primary"
          >
            {mode === "signin"
              ? "尚未建立總管理者？點此進行首次設定"
              : "返回登入"}
          </button>
          <p className="text-xs text-muted-foreground">
            帳號權限存放於雲端，核准與刪除報名皆由伺服器驗證身分。
          </p>
        </div>
      )}

      <AccountSettings />


      {role === "admin" && <QrRegisterCard />}

      {role === "admin" && (
        <div className="panel space-y-3 p-3">
          <h2 className="text-sm tracking-widest text-muted-foreground">賽事設定 TOURNAMENT</h2>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">桌數 TABLES</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTableCount(Math.max(1, tableCount - 1))}
                className="h-11 w-11 rounded-lg border border-border bg-secondary font-display"
              >
                −
              </button>
              <span className="w-8 text-center font-display text-xl neon-text">{tableCount}</span>
              <button
                onClick={() => setTableCount(Math.min(12, tableCount + 1))}
                className="h-11 w-11 rounded-lg border border-border bg-secondary font-display"
              >
                +
              </button>
            </div>
          </div>
          <button
            disabled={players.length < 2}
            onClick={generateBracket}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
          >
            <Shuffle className="h-5 w-5" /> 隨機產生賽程 RANDOM BRACKET
          </button>
          <button
            onClick={loadSample}
            className="min-h-12 w-full rounded-xl border border-primary/50 bg-accent/30 text-primary"
          >
            載入 16 位示範選手
          </button>
          <button
            onClick={resetTournament}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/60 text-destructive"
          >
            <RotateCcw className="h-4 w-4" /> 重置賽事
          </button>
        </div>
      )}
    </div>
  );
}
