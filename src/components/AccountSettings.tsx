import { useCallback, useEffect, useState } from "react";
import { KeyRound, Save, Trash2, UserCog, UserPlus } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { supabase } from "@/integrations/supabase/client";
import {
  createAdminFn,
  listAdminsFn,
  removeAdminFn,
  setAdminPasswordFn,
} from "@/lib/admin.functions";

type Msg = { ok: boolean; text: string } | null;

interface AdminRow {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
}

function MyAccount() {
  const { currentAdmin, refreshRole } = useTournament();
  const [email, setEmail] = useState(currentAdmin?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password && password !== confirm) {
      setMsg({ ok: false, text: "兩次密碼輸入不一致" });
      return;
    }
    if (password && password.length < 8) {
      setMsg({ ok: false, text: "密碼至少需 8 碼" });
      return;
    }
    setBusy(true);
    const payload: { email?: string; password?: string } = {};
    if (email.trim() && email.trim() !== currentAdmin?.email) payload.email = email.trim();
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
    setMsg({ ok: true, text: "已更新帳號資料" });
  };

  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <KeyRound className="h-4 w-4" /> 我的帳號 MY ACCOUNT
      </h2>
      <p className="text-xs text-muted-foreground">
        {currentAdmin?.isSuper ? "總管理者帳號（雲端）" : "管理者帳號（雲端）"}
      </p>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="登入信箱"
        className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
      />
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
      {msg && <p className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
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

  const load = useCallback(() => {
    listAdminsFn()
      .then((data) => setRows(data as AdminRow[]))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await createAdminFn({ data: { email: email.trim(), password } });
      setEmail("");
      setPassword("");
      setMsg({ ok: true, text: "已建立管理者帳號" });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "建立失敗" });
    }
    setBusy(false);
  };

  const resetPassword = async (userId: string) => {
    try {
      await setAdminPasswordFn({ data: { userId, password: newPass } });
      setNewPass("");
      setEditId(null);
      setMsg({ ok: true, text: "已更新該管理者密碼" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "更新失敗" });
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
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
              <span className="truncate text-sm">{a.email ?? a.user_id}</span>
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
          placeholder="新管理者信箱"
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
        <input
          value={password}
          type="password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="新管理者密碼（至少 8 碼）"
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

export function AccountSettings() {
  const { currentAdmin } = useTournament();
  if (!currentAdmin) return null;
  return (
    <div className="space-y-4">
      <MyAccount key={currentAdmin.email} />
      {currentAdmin.isSuper && <ManageAdmins />}
    </div>
  );
}
