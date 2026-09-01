import { useEffect, useState } from "react";
import { Building2, Save } from "lucide-react";
import { railwayApi } from "@/lib/railway-api";

type Organization = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended" | "archived";
  role: "owner" | "admin";
};

function message(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "ORGANIZATION_NAME_INVALID") return "組織名稱需為 1–80 個字元。";
  if (code === "FORBIDDEN") return "只有組織擁有者可以修改名稱。";
  if (code === "SELECTED_ORGANIZATION_FORBIDDEN") return "目前選取的組織已無法存取。";
  if (code === "TOO_MANY_ATTEMPTS") return "操作過於頻繁，請稍後再試。";
  return "組織資料處理失敗，請稍後再試。";
}

export function OrganizationSettingsCard() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    void railwayApi<{ organizations: Organization[]; selectedOrganizationId: string }>(
      "/api/organizations",
    )
      .then(({ organizations, selectedOrganizationId }) => {
        if (!alive) return;
        const selected = organizations.find((item) => item.id === selectedOrganizationId) ?? null;
        setOrganization(selected);
        setName(selected?.name ?? "");
      })
      .catch((cause: unknown) => alive && setError(message(cause)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    if (!organization || organization.role !== "owner" || saving) return;
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) {
      setError("組織名稱需為 1–80 個字元。");
      return;
    }
    if (cleanName === organization.name) return;

    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const result = await railwayApi<{ organization: Organization }>("/api/organizations", {
        method: "PATCH",
        body: JSON.stringify({ name: cleanName }),
      });
      setOrganization(result.organization);
      setName(result.organization.name);
      setSaved(true);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel space-y-3 p-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
          <Building2 className="h-4 w-4" /> 組織資料 ORGANIZATION
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          名稱可使用會所、協會、商店、社團或自訂品牌名稱。
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">讀取組織資料中…</p>
      ) : organization ? (
        <>
          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">組織名稱</span>
            <input
              value={name}
              maxLength={80}
              disabled={organization.role !== "owner" || saving}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              className="min-h-11 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary disabled:opacity-60"
            />
          </label>
          <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">組織代碼（建立後不可修改）</p>
            <p className="mt-1 break-all font-mono text-xs">{organization.slug}</p>
          </div>
          {organization.role === "owner" ? (
            <button
              type="button"
              disabled={saving || !name.trim() || name.trim() === organization.name}
              onClick={() => void save()}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
            >
              <Save className="h-4 w-4" /> {saving ? "儲存中…" : "儲存組織名稱"}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">只有組織擁有者可以修改名稱。</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">目前沒有可用的組織資料。</p>
      )}

      {saved && <p className="text-xs text-primary">組織名稱已更新。</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
