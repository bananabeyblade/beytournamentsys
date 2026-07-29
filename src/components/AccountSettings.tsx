import { useState } from "react";
import { KeyRound, Save, UserCog } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";

function CredentialForm({
  id,
  initialUsername,
  label,
  onDone,
}: {
  id: string;
  initialUsername: string;
  label: string;
  onDone?: () => void;
}) {
  const { updateAdmin } = useTournament();
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = () => {
    if (password !== confirm) {
      setMsg({ ok: false, text: "兩次密碼輸入不一致" });
      return;
    }
    const err = updateAdmin(id, username, password);
    if (err) {
      setMsg({ ok: false, text: err });
      return;
    }
    setPassword("");
    setConfirm("");
    setMsg({ ok: true, text: "已更新帳號資料" });
    onDone?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs tracking-widest text-muted-foreground">{label}</p>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="帳號名稱"
        className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
      />
      <input
        value={password}
        type="password"
        onChange={(e) => setPassword(e.target.value)}
        placeholder="新密碼"
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
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground"
      >
        <Save className="h-4 w-4" /> 儲存變更
      </button>
    </div>
  );
}

export function AccountSettings() {
  const { currentAdmin, admins } = useTournament();
  const [editId, setEditId] = useState<string | null>(null);

  if (!currentAdmin) return null;

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-3">
        <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
          <KeyRound className="h-4 w-4" /> 我的帳號 MY ACCOUNT
        </h2>
        <CredentialForm
          key={currentAdmin.id + currentAdmin.username}
          id={currentAdmin.id}
          initialUsername={currentAdmin.username}
          label={currentAdmin.isSuper ? "總管理者帳號" : "管理者帳號"}
        />
      </div>

      {currentAdmin.isSuper && (
        <div className="panel space-y-3 p-3">
          <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
            <UserCog className="h-4 w-4" /> 管理者帳密變更 MANAGE CREDENTIALS
          </h2>
          {admins.filter((a) => !a.isSuper).length === 0 && (
            <p className="text-xs text-muted-foreground">尚未建立其他管理者帳號。</p>
          )}
          <ul className="space-y-2">
            {admins
              .filter((a) => !a.isSuper)
              .map((a) => (
                <li key={a.id} className="rounded-lg border border-border bg-secondary/40 p-3">
                  <button
                    onClick={() => setEditId(editId === a.id ? null : a.id)}
                    className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="truncate text-sm">{a.username}</span>
                    <span className="shrink-0 text-xs text-primary">
                      {editId === a.id ? "收合" : "變更帳密"}
                    </span>
                  </button>
                  {editId === a.id && (
                    <div className="mt-3 border-t border-border pt-3">
                      <CredentialForm
                        key={a.id + a.username}
                        id={a.id}
                        initialUsername={a.username}
                        label={`編輯 ${a.username}`}
                      />
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
