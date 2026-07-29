import { useState } from "react";
import { LogIn, LogOut, Shuffle, RotateCcw, UserPlus, Trash2, Shield, Eye } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { AccountSettings } from "./AccountSettings";
import { QrRegisterCard } from "./QrRegisterCard";

export function SettingsTab() {
  const {
    role,
    setRole,
    currentAdmin,
    login,
    logout,
    admins,
    addAdmin,
    removeAdmin,
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
  const [nu, setNu] = useState("");
  const [np, setNp] = useState("");

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
            已登入：<span className="text-primary">{currentAdmin.username}</span>
            {currentAdmin.isSuper && " · 總管理者"}
          </p>
          <button
            onClick={logout}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/60 text-destructive"
          >
            <LogOut className="h-4 w-4" /> 登出
          </button>
        </div>
      ) : (
        <div className="panel space-y-3 p-3">
          <h2 className="text-sm tracking-widest text-muted-foreground">管理者登入 ADMIN LOGIN</h2>
          <input
            value={u}
            onChange={(e) => setU(e.target.value)}
            placeholder="帳號"
            className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />
          <input
            value={p}
            type="password"
            onChange={(e) => setP(e.target.value)}
            placeholder="密碼"
            className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button
            onClick={() => setErr(login(u, p) ? "" : "帳號或密碼錯誤")}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground"
          >
            <LogIn className="h-4 w-4" /> 登入
          </button>
          <p className="text-xs text-muted-foreground">
            預設總管理者：superadmin / beyx2024
          </p>
        </div>
      )}

      <AccountSettings />


      {currentAdmin?.isSuper && (
        <div className="panel space-y-3 p-3">
          <h2 className="text-sm tracking-widest text-muted-foreground">
            管理者帳號 ADMIN ACCOUNTS
          </h2>
          <ul className="space-y-2">
            {admins.map((a) => (
              <li
                key={a.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2"
              >
                <span className="truncate text-sm">
                  {a.username}
                  {a.isSuper && <span className="ml-2 text-xs text-primary">總管理者</span>}
                </span>
                {!a.isSuper && (
                  <button
                    aria-label={`移除 ${a.username}`}
                    onClick={() => removeAdmin(a.id)}
                    className="grid h-10 w-10 place-items-center rounded-lg text-destructive"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <input
            value={nu}
            onChange={(e) => setNu(e.target.value)}
            placeholder="新管理者帳號"
            className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />
          <input
            value={np}
            onChange={(e) => setNp(e.target.value)}
            placeholder="新管理者密碼"
            className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />
          <button
            onClick={() => {
              const e = addAdmin(nu, np);
              setErr(e ?? "");
              if (!e) {
                setNu("");
                setNp("");
              }
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
          >
            <UserPlus className="h-4 w-4" /> 新增管理者
          </button>
        </div>
      )}

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
