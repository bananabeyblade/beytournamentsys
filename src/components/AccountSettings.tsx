import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Save, ShieldPlus, Trash2, UserCog, UserPlus } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { supabase } from "@/integrations/supabase/client";
import {
  createAdminFn,
  createSuperadminFn,
  listAdminsFn,
  listCreatedSuperadminsFn,
  removeSuperadminFn,
  removeAdminFn,
  revealAdminPasswordFn,
  setAdminPasswordFn,
} from "@/lib/admin-client";
import { USERNAME_RE, displayAccount, isOwnerEmail } from "@/lib/account-id";
import { railwayAuthEnabled } from "@/lib/railway-api";

type Msg = { ok: boolean; text: string } | null;

interface AdminRow {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  created_at?: string | null;
  last_login_at?: string | null;
  created_by_user_id?: string | null;
}

function displayDate(value?: string | null) {
  if (!value) return "尚未登入";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-TW", { hour12: false });
}

function MyAccount({ onOpenDeveloper }: { onOpenDeveloper?: () => void }) {
  const { currentAdmin, refreshRole } = useTournament();
  const isSuper = !!currentAdmin?.isSuper;
  const isGoogle = currentAdmin?.isGoogle === true;
  // Owner-created superadmins may log in with a custom username instead of a real email.
  const usesEmailLogin = isSuper && (currentAdmin?.email ?? "").includes("@");
  const [email, setEmail] = useState(currentAdmin?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  if (isGoogle) {
    return (
      <div className="panel space-y-2 p-3">
        <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
          <KeyRound className="h-4 w-4" /> GOOGLE ACCOUNT
        </h2>
        <p className="text-sm">
          已透過 Google 登入：<span className="text-primary">{currentAdmin?.email}</span>
        </p>
        <p className="text-xs text-muted-foreground">此帳號的登入與密碼設定由 Google 管理。</p>
        {isOwnerEmail(currentAdmin?.email) && onOpenDeveloper && (
          <button
            type="button"
            onClick={onOpenDeveloper}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/30 font-display text-sm text-primary"
          >
            <ShieldPlus className="h-4 w-4" /> 前往開發者介面
          </button>
        )}
      </div>
    );
  }

  if (railwayAuthEnabled) {
    return (
      <div className="panel space-y-2 p-3">
        <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
          <KeyRound className="h-4 w-4" /> 我的帳號 MY ACCOUNT
        </h2>
        <p className="text-sm">
          帳號：<span className="text-primary">{currentAdmin?.email}</span>
        </p>
        <p className="text-xs text-muted-foreground">此帳號的密碼由擁有者統一設定與管理。</p>
      </div>
    );
  }

  const submit = async () => {
    if (password && password !== confirm) {
      setMsg({ ok: false, text: "兩次密碼輸入不一致" });
      return;
    }
    if (password && password.length < 8) {
      setMsg({ ok: false, text: "密碼至少需 8 碼" });
      return;
    }
    const nextEmail = email.trim();
    if (usesEmailLogin && nextEmail && nextEmail !== currentAdmin?.email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextEmail)) {
        setMsg({ ok: false, text: "請輸入有效的登入信箱" });
        return;
      }
    }
    setBusy(true);
    const payload: { email?: string; password?: string } = {};
    if (usesEmailLogin && nextEmail && nextEmail !== currentAdmin?.email) {
      payload.email = nextEmail;
    }
    if (password) payload.password = password;
    if (!payload.email && !payload.password) {
      setBusy(false);
      setMsg({ ok: false, text: "沒有變更內容" });
      return;
    }
    const { error } = await supabase.auth.updateUser(payload);
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setPassword("");
    setConfirm("");
    await refreshRole();
    setMsg({ ok: true, text: payload.password ? "已更新密碼" : "已更新帳號資料" });
  };

  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <KeyRound className="h-4 w-4" /> 我的帳號 MY ACCOUNT
      </h2>
      <p className="text-xs text-muted-foreground">
        {isSuper
          ? usesEmailLogin
            ? "總管理者帳號（信箱登入）"
            : "總管理者帳號（自訂帳號登入）"
          : "管理者帳號（自訂帳號登入）"}
      </p>
      {usesEmailLogin ? (
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="登入信箱"
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
      ) : (
        <div className="min-h-12 w-full rounded-xl border border-border bg-secondary/40 px-3 py-3 text-sm">
          帳號：<span className="text-primary">{currentAdmin?.email}</span>
        </div>
      )}

      <input
        value={password}
        type="password"
        onChange={(e) => setPassword(e.target.value)}
        placeholder="新密碼（至少 8 碼，留空不變更）"
        className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
      />
      <input
        value={confirm}
        type="password"
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="確認新密碼"
        className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
      />
      {msg && (
        <p className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
      )}
      <button
        onClick={submit}
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> 儲存變更
      </button>
    </div>
  );
}

function ManageAdmins() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newPass, setNewPass] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const load = useCallback(() => {
    listAdminsFn()
      .then((data) => setRows(data as AdminRow[]))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const create = async () => {
    const account = email.trim();
    const valid = account.includes("@")
      ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)
      : USERNAME_RE.test(account);
    if (!valid) {
      setMsg({ ok: false, text: "請輸入有效的帳號（3-30 字）或信箱" });
      return;
    }
    if (password.length < (railwayAuthEnabled ? 8 : 4)) {
      setMsg({ ok: false, text: railwayAuthEnabled ? "密碼至少需 8 碼" : "密碼至少需 4 碼" });
      return;
    }
    // Catch duplicates before hitting the server so the user gets a clear hint.
    const clash = rows.find((r) => displayAccount(r.email).toLowerCase() === account.toLowerCase());
    if (clash) {
      setMsg({
        ok: false,
        text:
          clash.role === "superadmin"
            ? "此帳號已存在（目前為總管理者），請改用其他帳號名稱"
            : "此帳號已存在（目前為管理者），請改用其他帳號或使用清單中的「重設密碼」",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await createAdminFn({ data: { username: account, password } });
      if (!res.ok) {
        setMsg({ ok: false, text: res.message ?? "建立失敗" });
      } else {
        setEmail("");
        setPassword("");
        setMsg({ ok: true, text: "已建立管理者帳號" });
        load();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "建立失敗" });
    }
    setBusy(false);
  };

  const resetPassword = async (userId: string) => {
    if (newPass.length < (railwayAuthEnabled ? 8 : 4)) {
      setMsg({ ok: false, text: railwayAuthEnabled ? "密碼至少需 8 碼" : "密碼至少需 4 碼" });
      return;
    }
    try {
      const res = await setAdminPasswordFn({ data: { userId, password: newPass } });
      if (!res.ok) {
        setMsg({ ok: false, text: res.message ?? "更新失敗" });
        return;
      }
      setNewPass("");
      setEditId(null);
      setRevealed((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      setMsg({ ok: true, text: "已更新該管理者密碼" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "更新失敗" });
    }
  };

  const togglePassword = async (userId: string) => {
    if (revealed[userId]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      return;
    }
    setRevealingId(userId);
    try {
      const result = await revealAdminPasswordFn({ data: { userId } });
      if (!result.password) {
        setMsg({ ok: false, text: "此帳號尚未設定可查看的密碼，請使用重設密碼功能。" });
      } else {
        setRevealed((current) => ({ ...current, [userId]: result.password! }));
      }
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : "讀取密碼失敗" });
    } finally {
      setRevealingId(null);
    }
  };

  const remove = async (userId: string) => {
    try {
      await removeAdminFn({ data: { userId } });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "移除失敗" });
    }
  };

  const admins = rows.filter((r) => r.role === "admin");

  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <UserCog className="h-4 w-4" /> 管理者帳號 ADMIN ACCOUNTS
      </h2>
      {admins.length === 0 && (
        <p className="text-xs text-muted-foreground">尚未建立其他管理者帳號。</p>
      )}
      <ul className="space-y-2">
        {admins.map((a) => (
          <li key={a.id} className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
              <span className="truncate text-sm">{displayAccount(a.email) || a.user_id}</span>
              {railwayAuthEnabled && (
                <button
                  type="button"
                  disabled={revealingId === a.user_id}
                  aria-label={revealed[a.user_id] ? "隱藏密碼" : "查看密碼"}
                  onClick={() => void togglePassword(a.user_id)}
                  className="grid h-10 w-10 place-items-center rounded-lg text-primary disabled:opacity-50"
                >
                  {revealed[a.user_id] ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              )}
              <button
                onClick={() => setEditId(editId === a.user_id ? null : a.user_id)}
                className="min-h-10 shrink-0 rounded-lg px-2 text-xs text-primary"
              >
                {editId === a.user_id ? "收合" : "重設密碼"}
              </button>
              <button
                aria-label={`移除 ${a.email ?? a.user_id}`}
                onClick={() => remove(a.user_id)}
                className="grid h-10 w-10 place-items-center rounded-lg text-destructive"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
            {revealed[a.user_id] && (
              <div className="mt-2 rounded-lg border border-primary/30 bg-background/70 px-3 py-2 font-mono text-sm">
                密碼：{revealed[a.user_id]}
              </div>
            )}
            {editId === a.user_id && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <input
                  value={newPass}
                  type="password"
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder={railwayAuthEnabled ? "新密碼（至少 8 碼）" : "新密碼（至少 4 碼）"}
                  className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
                />
                <button
                  onClick={() => resetPassword(a.user_id)}
                  className="min-h-12 w-full rounded-xl bg-primary font-display text-primary-foreground"
                >
                  更新密碼
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-border pt-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="新管理者帳號或信箱"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
        <input
          value={password}
          type="password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder={
            railwayAuthEnabled ? "新管理者密碼（至少 8 碼）" : "新管理者密碼（至少 4 碼）"
          }
          autoComplete="new-password"
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
        {msg && (
          <p className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
        )}
        <button
          onClick={create}
          disabled={busy}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/40 font-display text-primary disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" /> 新增管理者
        </button>
      </div>
    </div>
  );
}

function ManageSuperadmins() {
  const { currentAdmin } = useTournament();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [newPass, setNewPass] = useState("");

  const load = useCallback(() => {
    listCreatedSuperadminsFn()
      .then((data) => setRows((data as AdminRow[]).filter((row) => row.role === "superadmin")))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const create = async () => {
    const account = email.trim();
    const valid = account.includes("@")
      ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)
      : USERNAME_RE.test(account);
    if (!valid) {
      setMsg({ ok: false, text: "請輸入有效的帳號（3-30 字）或信箱" });
      return;
    }
    if (password.length < 8) {
      setMsg({ ok: false, text: "密碼至少需 8 碼" });
      return;
    }
    setBusy(true);
    try {
      await createSuperadminFn({ data: { account, password } });
      setEmail("");
      setPassword("");
      setMsg({ ok: true, text: "已新增總管理者" });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "新增失敗" });
    }
    setBusy(false);
  };

  const togglePassword = async (userId: string) => {
    if (revealed[userId]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      return;
    }
    setRevealingId(userId);
    try {
      const result = await revealAdminPasswordFn({ data: { userId } });
      if (!result.password) {
        setMsg({ ok: false, text: "此帳號尚未設定可查看的密碼，請重新建立或重設密碼。" });
      } else {
        setRevealed((current) => ({ ...current, [userId]: result.password! }));
      }
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : "讀取密碼失敗" });
    } finally {
      setRevealingId(null);
    }
  };

  const remove = async (userId: string) => {
    try {
      await removeSuperadminFn({ data: { userId } });
      setMsg({ ok: true, text: "已移除總管理者" });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "移除失敗" });
    }
  };

  const resetPassword = async (userId: string) => {
    if (newPass.length < 8) {
      setMsg({ ok: false, text: "密碼至少需 8 碼" });
      return;
    }
    try {
      await setAdminPasswordFn({ data: { userId, password: newPass } });
      setNewPass("");
      setEditId(null);
      setRevealed((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      setMsg({ ok: true, text: "已更新該總管理者密碼" });
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : "更新失敗" });
    }
  };

  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <ShieldPlus className="h-4 w-4" /> 總管理者帳號 SUPERADMINS
      </h2>
      <p className="text-xs text-muted-foreground">
        只顯示由你建立的總管理者。可新增、重設密碼或移除，帳號可用自訂名稱或信箱。
      </p>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">尚未建立其他總管理者。</p>}
      <ul className="space-y-2">
        {rows.map((a) => (
          <li key={a.id} className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2">
              <span className="truncate text-sm">{displayAccount(a.email) || a.user_id}</span>
              {railwayAuthEnabled && (
                <button
                  type="button"
                  disabled={revealingId === a.user_id}
                  aria-label={revealed[a.user_id] ? "隱藏密碼" : "查看密碼"}
                  onClick={() => void togglePassword(a.user_id)}
                  className="grid h-10 w-10 place-items-center rounded-lg text-primary disabled:opacity-50"
                >
                  {revealed[a.user_id] ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              )}
              <button
                onClick={() => setEditId(editId === a.user_id ? null : a.user_id)}
                className="min-h-10 shrink-0 rounded-lg px-2 text-xs text-primary"
              >
                {editId === a.user_id ? "收合" : "重設密碼"}
              </button>
              <button
                aria-label={`移除總管理者 ${displayAccount(a.email) || a.user_id}`}
                onClick={() => remove(a.user_id)}
                className="grid h-10 w-10 place-items-center rounded-lg text-destructive"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              建立：{displayDate(a.created_at)} / 最近登入：{displayDate(a.last_login_at)}
            </p>
            {revealed[a.user_id] && (
              <div className="mt-2 rounded-lg border border-primary/30 bg-background/70 px-3 py-2 font-mono text-sm">
                密碼：{revealed[a.user_id]}
              </div>
            )}
            {editId === a.user_id && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <input
                  value={newPass}
                  type="password"
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="新密碼（至少 8 碼）"
                  className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
                />
                <button
                  onClick={() => void resetPassword(a.user_id)}
                  className="min-h-12 w-full rounded-xl bg-primary font-display text-primary-foreground"
                >
                  更新密碼
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-border pt-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="新總管理者帳號或信箱"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
        <input
          value={password}
          type="password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密碼（至少 8 碼）"
          autoComplete="new-password"
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
        {msg && (
          <p className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>
        )}
        <button
          onClick={create}
          disabled={busy}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/40 font-display text-primary disabled:opacity-50"
        >
          <ShieldPlus className="h-4 w-4" /> 新增／更新總管理者
        </button>
      </div>
    </div>
  );
}

export function AccountSettings({ onOpenDeveloper }: { onOpenDeveloper?: () => void }) {
  const { currentAdmin } = useTournament();
  if (!currentAdmin) return null;
  return (
    <div className="space-y-4">
      <MyAccount key={currentAdmin.email} onOpenDeveloper={onOpenDeveloper} />
      {isOwnerEmail(currentAdmin.email) && <ManageSuperadmins />}
      {currentAdmin.isSuper && <ManageAdmins />}
    </div>
  );
}
