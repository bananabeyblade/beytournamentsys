import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, LogOut, Plus } from "lucide-react";
import { fetchRailwaySession, logoutRailway, type RailwayAuthUser } from "@/lib/railway-auth";
import { railwayApi } from "@/lib/railway-api";

type Organization = {
  id: string;
  slug: string;
  name: string;
};

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "建立會所 | Beyblade Tournament System" }] }),
  component: OrganizationOnboarding,
});

function messageFor(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "ORGANIZATION_SLUG_EXISTS") return "此會所代碼已被使用，請更換一組。";
  if (code === "ORGANIZATION_SLUG_INVALID") return "會所代碼僅能使用小寫英文字母、數字與連字號。";
  if (code === "ORGANIZATION_NAME_INVALID") return "會所名稱需為 1–80 個字元。";
  if (code === "ORGANIZATION_LIMIT_REACHED") return "此帳號已建立會所，請重新登入後再試。";
  if (code === "GOOGLE_ACCOUNT_REQUIRED") return "請使用已驗證的 Google 帳號註冊。";
  return "建立會所失敗，請稍後再試。";
}

function OrganizationOnboarding() {
  const [user, setUser] = useState<RailwayAuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchRailwaySession()
      .then(async (session) => {
        if (!alive) return;
        if (!session?.isGoogle) {
          setError("請先使用 Google 帳號登入／註冊。");
          return;
        }
        setUser(session);
        if (session.role) {
          const result = await railwayApi<{ organizations: Organization[] }>(
            "/api/organizations",
          ).catch(() => null);
          if (result?.organizations.length) {
            window.location.replace("/");
            return;
          }
        }
      })
      .catch(() => alive && setError("無法確認登入狀態，請重新登入。"))
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const create = async () => {
    const cleanName = name.trim();
    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanName || !cleanSlug) {
      setError("請輸入會所名稱與會所代碼。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await railwayApi<{ organization: Organization }>("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name: cleanName, slug: cleanSlug }),
      });
      await railwayApi("/api/organizations/select", {
        method: "POST",
        body: JSON.stringify({ organizationId: result.organization.id }),
      });
      window.location.assign("/?onboarding=success");
    } catch (cause) {
      setError(messageFor(cause));
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <header>
        <h1 className="flex items-center gap-2 font-display text-2xl neon-text">
          <Building2 className="h-6 w-6" /> 建立你的會所
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Google 帳號完成驗證後，你會成為此會所的擁有者，可建立賽事與管理會所成員。
        </p>
      </header>

      <section className="panel space-y-4 p-4">
        {!ready ? (
          <p className="text-sm text-muted-foreground">確認 Google 帳號中…</p>
        ) : user ? (
          <>
            <p className="text-xs text-muted-foreground">
              註冊帳號：<span className="break-all text-primary">{user.email}</span>
            </p>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">會所名稱</span>
              <input
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：北區陀螺會所"
                className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="text-muted-foreground">會所代碼</span>
              <input
                value={slug}
                maxLength={48}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) =>
                  setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                }
                placeholder="例如：north-club"
                className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 font-mono outline-none focus:border-primary"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void create()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> {saving ? "建立中…" : "建立會所並開始使用"}
            </button>
          </>
        ) : null}

        {error && <p className="text-xs text-destructive">{error}</p>}
        {ready && (
          <button
            type="button"
            onClick={async () => {
              await logoutRailway().catch(() => undefined);
              window.location.assign("/admin");
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm"
          >
            <LogOut className="h-4 w-4" /> 改用其他 Google 帳號
          </button>
        )}
      </section>

      <p className="text-xs leading-relaxed text-muted-foreground">
        每個一般帳號目前限建立一個會所；資料與其他會所完全分開。平台管理權不會因註冊而授予。
      </p>
    </main>
  );
}
