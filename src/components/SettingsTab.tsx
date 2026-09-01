import { useState } from "react";
import { LogIn, LogOut, Shuffle, RotateCcw, Shield, Eye } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { AccountSettings } from "./AccountSettings";
import { FirstTimeSetup } from "./FirstTimeSetup";
import { TournamentHistory } from "./TournamentHistory";
import { AuditLogCard } from "./AuditLogCard";
import { AdminPlayerRegistration } from "./AdminPlayerRegistration";
import { RefereeAccessCard } from "./RefereeAccessCard";
import { OrganizationSettingsCard } from "./OrganizationSettingsCard";
import { OrganizationInvitationsCard } from "./OrganizationInvitationsCard";
import { railwayAuthEnabled } from "@/lib/railway-api";

function TournamentSettingsPanel() {
  const {
    currentAdmin,
    tableCount,
    setTableCount,
    generateBracket,
    resetTournament,
    loadSample,
    players,
    rosterLocked,
    currentTournament,
  } = useTournament();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");

  if (!currentAdmin || currentAdmin.isReferee) return null;

  return (
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
        disabled={players.length < 2 || rosterLocked}
        onClick={generateBracket}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
      >
        <Shuffle className="h-5 w-5" /> 隨機產生賽程 RANDOM BRACKET
      </button>
      <button
        disabled={rosterLocked || !currentTournament}
        onClick={loadSample}
        className="min-h-12 w-full rounded-xl border border-primary/50 bg-accent/30 text-primary"
      >
        載入 16 位示範選手
      </button>
      <button
        onClick={() => {
          setResetError("");
          setConfirmReset(true);
        }}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/60 text-destructive"
      >
        <RotateCcw className="h-4 w-4" />
        {currentTournament?.status === "finished" ? "離開已結束賽事" : "重置賽事"}
      </button>
      {confirmReset && (
        <div className="space-y-2 rounded-xl border border-destructive/60 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            {currentTournament?.status === "finished"
              ? "確定要離開這場已結束賽事嗎？封存成績會保留，不會被刪除。"
              : "確定要重置賽事嗎？這會清除目前賽事的選手、賽程與比分，且無法復原。"}
          </p>
          <p className="text-xs text-muted-foreground">
            請再次按下「{currentTournament?.status === "finished" ? "確認離開" : "確認重置"}
            」才會執行。
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={resetBusy}
              onClick={() => setConfirmReset(false)}
              className="min-h-12 rounded-xl border border-border text-sm text-muted-foreground disabled:opacity-40"
            >
              取消
            </button>
            <button
              disabled={resetBusy}
              onClick={async () => {
                setResetBusy(true);
                setResetError("");
                const failure = await resetTournament();
                setResetBusy(false);
                if (failure) {
                  setResetError(failure);
                  return;
                }
                setConfirmReset(false);
              }}
              className="min-h-12 rounded-xl bg-destructive font-display text-sm text-foreground disabled:opacity-40"
            >
              {resetBusy
                ? "處理中…"
                : currentTournament?.status === "finished"
                  ? "確認離開"
                  : "確認重置"}
            </button>
          </div>
          {resetError && <p className="text-xs text-destructive">{resetError}</p>}
        </div>
      )}
    </div>
  );
}

export function SettingsTab() {
  const { role, setRole, currentAdmin, authIssue, signIn, signInWithGoogle, logout } =
    useTournament();

  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (!currentAdmin) {
    return (
      <div className="space-y-4">
        <FirstTimeSetup />
        <div className="panel space-y-3 p-3">
          <h2 className="text-sm tracking-widest text-muted-foreground">管理者登入 ADMIN LOGIN</h2>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              const fail = await signInWithGoogle();
              if (fail) {
                setErr(fail);
                setBusy(false);
              }
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card font-display text-foreground disabled:opacity-50"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-blue-600">
              G
            </span>
            使用 Google 登入／註冊組織
          </button>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            其他管理者可使用帳號密碼登入
            <span className="h-px flex-1 bg-border" />
          </div>
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
          {(err || authIssue) && <p className="text-xs text-destructive">{err || authIssue}</p>}
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
          <p className="text-xs text-muted-foreground">
            帳號權限存放於雲端，核准與刪除報名皆由伺服器驗證身分。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel p-3">
        <h2 className="mb-2 text-sm tracking-widest text-muted-foreground">角色切換 ROLE</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setRole("player")}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border font-display ${
              role === "player"
                ? "neon-edge bg-accent/40 text-primary"
                : "border-border bg-secondary"
            }`}
          >
            <Eye className="h-4 w-4" /> 參賽者
          </button>
          <button
            onClick={() => setRole("admin")}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border font-display disabled:opacity-40 ${
              role === "admin"
                ? "neon-edge bg-accent/40 text-primary"
                : "border-border bg-secondary"
            }`}
          >
            <Shield className="h-4 w-4" /> 管理者
          </button>
        </div>
      </div>

      <div className="panel p-3">
        <p className="text-sm">
          已登入：<span className="text-primary">{currentAdmin.email}</span>
          {currentAdmin.isDeveloper
            ? " · 平台擁有者"
            : currentAdmin.organizationRole === "owner"
              ? " · 組織擁有者"
              : " · 組織管理者"}
        </p>
        <button
          onClick={() => void logout()}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/60 text-destructive"
        >
          <LogOut className="h-4 w-4" /> 登出
        </button>
      </div>

      {railwayAuthEnabled && <OrganizationSettingsCard />}

      {railwayAuthEnabled && <OrganizationInvitationsCard />}

      <AccountSettings beforeAdminAccounts={<TournamentSettingsPanel />} />

      <AdminPlayerRegistration />

      {role === "admin" && <RefereeAccessCard />}

      {role === "admin" && <TournamentHistory />}

      <AuditLogCard />
    </div>
  );
}
