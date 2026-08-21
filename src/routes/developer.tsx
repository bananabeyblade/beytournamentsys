import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  ClipboardList,
  Database,
  Power,
  Shield,
  Terminal,
  Users,
} from "lucide-react";
import { TournamentProvider, useTournament } from "@/lib/tournament-store";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { ManageAdmins, ManageSuperadmins } from "@/components/AccountSettings";
import { TournamentHistory } from "@/components/TournamentHistory";
import { SystemStatusCard } from "@/components/SystemStatusCard";
import { isDeveloperEmail } from "@/lib/account-id";
import { listTournaments, type TournamentRow } from "@/lib/tournaments";
import { fetchDeckReport, type DeckReport } from "@/lib/deck-report";
import { railwayApi } from "@/lib/railway-api";

export const Route = createFileRoute("/developer")({
  head: () => ({
    meta: [{ title: "開發者控制台 | 竹塹陀螺集會所賽事系統" }],
  }),
  component: () => (
    <TournamentProvider>
      <DeveloperConsolePage />
    </TournamentProvider>
  ),
});

function DeveloperConsolePage() {
  const { currentAdmin, setRole } = useTournament();
  const navigate = useNavigate();

  // This console is only reachable by the developer; ensure SystemStatusCard's
  // internal admin-role gate is satisfied even though this route mounts a
  // fresh TournamentProvider (role defaults back to "player" per instance).
  useEffect(() => {
    if (currentAdmin && isDeveloperEmail(currentAdmin.email)) setRole("admin");
  }, [currentAdmin, setRole]);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const tabs = useMemo(
    () => [
      { id: "history", label: "賽事歷史", icon: ClipboardList, content: <TournamentHistory /> },
      { id: "superadmins", label: "總管理者", icon: Shield, content: <ManageSuperadmins /> },
      { id: "admins", label: "管理者", icon: Users, content: <ManageAdmins /> },
      { id: "status", label: "系統狀態", icon: Database, content: <SystemStatusCard /> },
      { id: "features", label: "功能開關", icon: Power, content: <DeveloperFeatureFlags /> },
      { id: "stats", label: "Combo／Deck 統計", icon: BarChart3, content: <DeveloperDeckStats /> },
    ],
    [],
  );

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 pb-6">
      <ConnectionBanner />
      <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else void navigate({ to: "/" });
          }}
          className="mb-2 flex min-h-10 items-center gap-2 rounded-xl border border-border bg-secondary px-3 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> 返回
        </button>
        <h1 className="flex items-center gap-2 font-display text-2xl neon-text">
          <Terminal className="h-6 w-6" /> 開發者控制台
        </h1>
        <p className="text-[11px] tracking-widest text-muted-foreground">DEVELOPER CONSOLE</p>
      </div>

      {!currentAdmin ? (
        <div className="panel space-y-3 p-3">
          <p className="text-sm text-muted-foreground">請先登入管理者帳號。</p>
          <Link
            to="/admin"
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
          >
            前往登入
          </Link>
        </div>
      ) : !isDeveloperEmail(currentAdmin.email) ? (
        <div className="panel space-y-3 p-3">
          <p className="text-sm text-muted-foreground">此頁面僅限開發者帳號使用。</p>
          <Link
            to="/"
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-primary/60 bg-accent/40 font-display text-primary"
          >
            返回賽事系統
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {activeTab ? (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-secondary px-3 text-sm"
              >
                <ArrowLeft className="h-4 w-4" /> 返回開發者控制台
              </button>
              {tabs.find((tab) => tab.id === activeTab)?.content}
            </section>
          ) : (
            <div className="grid gap-3">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="panel flex min-h-16 items-center justify-between px-4 text-left transition hover:border-primary/70"
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="font-semibold">{tab.label}</span>
                    </span>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function DeveloperFeatureFlags() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void railwayApi<{ flags: Array<{ key: string; enabled: boolean }> }>("/api/admin/feature-flags")
      .then(({ flags }) => {
        if (alive)
          setEnabled(flags.find((flag) => flag.key === "deck_registration")?.enabled ?? true);
      })
      .catch(() => alive && setError("無法讀取功能開關。"));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async () => {
    if (enabled === null || saving) return;
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      await railwayApi("/api/admin/set-feature-flag", {
        method: "POST",
        body: JSON.stringify({ key: "deck_registration", enabled: next }),
      });
      setEnabled(next);
    } catch {
      setError("更新失敗，請稍後重試。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel space-y-4 p-4">
      <div>
        <h2 className="font-display text-lg neon-text">功能開關</h2>
        <p className="text-xs text-muted-foreground">變更會立即套用到所有選手端。</p>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div>
          <p className="font-semibold">Deck 登錄</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {enabled === null
              ? "讀取設定中…"
              : enabled
                ? "目前開放選手填寫與更新 Deck。"
                : "目前已關閉；既有 Deck 不會被刪除。"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled === true}
          disabled={enabled === null || saving}
          onClick={() => void toggle()}
          className={`relative h-8 w-14 rounded-full transition ${enabled ? "bg-primary" : "bg-muted"} disabled:opacity-50`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-background shadow transition ${enabled ? "left-7" : "left-1"}`}
          />
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}

function DeveloperDeckStats() {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [reports, setReports] = useState<Array<{ tournament: TournamentRow; report: DeckReport }>>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void listTournaments()
      .then((rows) => {
        if (!alive) return;
        setTournaments(rows);
        return Promise.all(
          rows.slice(0, 50).map(async (tournament) => ({
            tournament,
            report: await fetchDeckReport(tournament.id),
          })),
        );
      })
      .then((next) => {
        if (alive && next) setReports(next);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : "統計資料讀取失敗");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const aggregate = useMemo(() => {
    const parts = new Map<
      string,
      { name: string; count: number; upperCount: number; participants: Set<string> }
    >();
    let samples = 0;
    let trackedBattles = 0;
    for (const { report } of reports) {
      samples += report.qualifierCount;
      trackedBattles += report.trackedBattleCount;
      const partNames = new Map(report.partUsage.map((part) => [part.id, part.name]));
      for (const snapshot of report.snapshots) {
        const partIds = new Set<string>();
        for (const combo of snapshot.combos) {
          for (const field of [
            "bladeId",
            "lockChipId",
            "mainBladeId",
            "assistBladeId",
            "metalBladeId",
            "overBladeId",
            "ratchetId",
            "bitId",
          ] as const) {
            const id = combo[field];
            if (id) partIds.add(id);
          }
        }
        for (const id of partIds) {
          const current = parts.get(id) ?? {
            name: partNames.get(id) ?? id,
            count: 0,
            upperCount: 0,
            participants: new Set<string>(),
          };
          const participantKey = snapshot.participantName.trim().toLowerCase();
          if (!current.participants.has(participantKey)) {
            current.participants.add(participantKey);
            current.count += 1;
            if (snapshot.rank !== undefined && snapshot.rank <= 4) current.upperCount += 1;
          }
          parts.set(id, current);
        }
      }
    }
    return {
      samples,
      trackedBattles,
      parts: [...parts.values()]
        .map(({ participants, ...part }) => ({
          ...part,
          usageRate: samples ? (part.count / samples) * 100 : 0,
          upperPlacementRate: part.count ? (part.upperCount / part.count) * 100 : 0,
          participantCount: participants.size,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }, [reports]);

  return (
    <div className="panel space-y-4 p-4">
      <div>
        <h2 className="font-display text-lg neon-text">COMBO／DECK STATISTICS</h2>
        <p className="text-xs text-muted-foreground">
          跨賽事彙總；只讀取已保存的 Deck 與八強戰鬥紀錄。
        </p>
      </div>
      {loading && <p className="text-sm text-muted-foreground">讀取統計中…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-border p-2">
              <b className="block text-lg">{tournaments.length}</b>賽事樣本
            </div>
            <div className="rounded-lg border border-border p-2">
              <b className="block text-lg">{aggregate.samples}</b>八強選手
            </div>
            <div className="rounded-lg border border-border p-2">
              <b className="block text-lg">{aggregate.trackedBattles}</b>已追蹤局數
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">零件使用率／樣本數／上位率</h3>
            {aggregate.parts.length ? (
              <ul className="space-y-2 text-xs">
                {aggregate.parts.slice(0, 20).map((part) => (
                  <li
                    key={part.name}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span>{part.name}</span>
                    <span className="text-right text-muted-foreground">
                      <span className="block">
                        {part.count} 人次 · {part.usageRate.toFixed(1)}%
                      </span>
                      <span className="block">上位 {part.upperPlacementRate.toFixed(1)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">尚無可統計的 Deck。</p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            後續可加入：四強／冠軍上位率、每局勝率、同組合勝率與樣本信賴區間。
          </p>
        </>
      )}
    </div>
  );
}
