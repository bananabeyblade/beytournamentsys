import { Crown, RefreshCw, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listDeveloperAccountsFn } from "@/lib/admin-client";
import { displayAccount } from "@/lib/account-id";
import { useTournament } from "@/lib/tournament-store";
import { SystemStatusCard } from "./SystemStatusCard";

type DeveloperAccount = {
  id: string;
  email: string;
  display_name: string | null;
  google_subject: string | null;
  role: "admin" | "superadmin" | null;
  created_at: string;
  last_login_at: string | null;
  created_by_email: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "尚未登入";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-TW", { hour12: false });
}

function roleLabel(account: DeveloperAccount) {
  if (account.email.toLowerCase() === "john410403123@gmail.com" && account.google_subject)
    return "開發者";
  if (account.role === "superadmin") return "總管理者";
  if (account.role === "admin") return "管理者";
  return "一般帳號";
}

/**
 * Platform diagnostics are deliberately kept outside the normal event
 * settings area. Only the Google platform owner can open this tab.
 */
export function PlatformOwnerTab() {
  const { isOwner } = useTournament();
  const [accounts, setAccounts] = useState<DeveloperAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(() => {
    setLoading(true);
    void listDeveloperAccountsFn()
      .then((data) => setAccounts(data as DeveloperAccount[]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadAccounts, [loadAccounts]);

  if (!isOwner) return null;

  return (
    <div className="space-y-4">
      <div className="panel flex items-start gap-3 p-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/60 bg-accent/30 text-primary">
          <Crown className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-sm text-foreground">開發者 DEVELOPER</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            john410403123@gmail.com 的 Google 登入帳號是唯一開發者，可使用完整平台功能。
          </p>
        </div>
      </div>
      <section className="panel space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
              <UserRound className="h-4 w-4" /> 帳號總覽 ACCOUNT DIRECTORY
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              所有帳號都會列出；一般帳號不代表遺失資料，只是尚未被賦予管理角色。
            </p>
          </div>
          <button
            type="button"
            onClick={loadAccounts}
            disabled={loading}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/50 text-primary disabled:opacity-50"
            aria-label="重新載入帳號總覽"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="rounded-xl border border-border bg-secondary/40 p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {account.display_name || displayAccount(account.email)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{account.email}</p>
                </div>
                <span className="shrink-0 rounded-full border border-primary/40 px-2 py-1 text-xs text-primary">
                  {roleLabel(account)}
                </span>
              </div>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <span>
                  登入：{account.google_subject ? "Google" : account.role ? "帳號密碼" : "未設定"}
                </span>
                <span>
                  建立者：
                  {account.created_by_email ? displayAccount(account.created_by_email) : "—"}
                </span>
                <span>建立時間：{formatDate(account.created_at)}</span>
                <span>最近登入：{formatDate(account.last_login_at)}</span>
              </div>
            </li>
          ))}
          {!loading && accounts.length === 0 && (
            <li className="text-sm text-muted-foreground">目前沒有可顯示的帳號。</li>
          )}
        </ul>
      </section>
      <SystemStatusCard />
    </div>
  );
}
