import { useCallback, useEffect, useState } from "react";
import { MailPlus, X } from "lucide-react";
import { railwayApi } from "@/lib/railway-api";
import { useTournament } from "@/lib/tournament-store";

type Invitation = {
  id: string;
  email: string;
  role: "admin";
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
};

const statusText: Record<Invitation["status"], string> = {
  pending: "等待登入",
  accepted: "已加入",
  revoked: "已撤銷",
  expired: "已過期",
};

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "INVITATION_EMAIL_INVALID") return "請輸入有效的 Google 信箱。";
  if (code === "INVITATION_SELF") return "你已是此組織的擁有者，不需要邀請自己。";
  if (code === "INVITATION_MEMBER_EXISTS") return "此信箱已是組織成員。";
  if (code === "INVITATION_NOT_FOUND") return "邀請不存在或已無法撤銷。";
  if (code === "FORBIDDEN") return "只有組織擁有者可以管理邀請。";
  if (code === "TOO_MANY_ATTEMPTS") return "邀請操作過於頻繁，請稍後再試。";
  return "邀請處理失敗，請稍後再試。";
}

export function OrganizationInvitationsCard() {
  const { currentAdmin } = useTournament();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await railwayApi<{ invitations: Invitation[] }>("/api/organization-invitations");
    setInvitations(result.invitations);
  }, []);

  useEffect(() => {
    if (currentAdmin?.organizationRole !== "owner") {
      setLoading(false);
      return;
    }
    let alive = true;
    void load()
      .catch((cause: unknown) => alive && setError(errorMessage(cause)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [currentAdmin?.organizationRole, load]);

  if (currentAdmin?.organizationRole !== "owner") return null;

  const invite = async () => {
    if (busy) return;
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("請輸入要邀請的 Google 信箱。");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await railwayApi("/api/organization-invitations", {
        method: "POST",
        body: JSON.stringify({ email: normalized }),
      });
      setEmail("");
      setSuccess(`已建立 ${normalized} 的邀請。`);
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invitationId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await railwayApi("/api/organization-invitations", {
        method: "DELETE",
        body: JSON.stringify({ invitationId }),
      });
      setSuccess("邀請已撤銷。");
      await load();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel space-y-3 p-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
          <MailPlus className="h-4 w-4" /> 邀請組織管理者
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          對方須在 7 天內使用完全相同且經 Google
          驗證的信箱登入，才會加入目前組織。邀請不會取得平台權限。
        </p>
      </div>

      <div className="space-y-2">
        <input
          type="email"
          value={email}
          maxLength={320}
          disabled={busy}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="manager@example.com"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary disabled:opacity-50"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void invite()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-50"
        >
          <MailPlus className="h-4 w-4" /> {busy ? "處理中…" : "建立 Google 信箱邀請"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          系統目前建立登入許可，不會寄送電子郵件；請自行將登入網址通知對方。
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">讀取邀請中…</p>
      ) : invitations.length ? (
        <ul className="space-y-2 border-t border-border pt-3">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{invitation.email}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {statusText[invitation.status]}
                  {invitation.status === "pending" &&
                    ` · 到期 ${new Date(invitation.expiresAt).toLocaleDateString("zh-TW", {
                      timeZone: "Asia/Taipei",
                    })}`}
                </p>
              </div>
              {invitation.status === "pending" && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`撤銷 ${invitation.email} 的邀請`}
                  onClick={() => void revoke(invitation.id)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-destructive disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">目前沒有邀請紀錄。</p>
      )}

      {success && <p className="text-xs text-primary">{success}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
