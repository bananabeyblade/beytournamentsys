import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { fetchDeckReport, type DeckReport } from "@/lib/deck-report";

export function DeckStatisticsCard({ tournamentId }: { tournamentId: string }) {
  const [report, setReport] = useState<DeckReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await fetchDeckReport(tournamentId));
    } catch {
      setError("暫時無法載入八強 Deck 統計，請稍後再試。");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="panel space-y-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
            <BarChart3 className="h-4 w-4" /> 八強 DECK 統計
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            八強名單確定時自動保存 Deck；統計不增加賽事輪詢負擔。
          </p>
        </div>
        <button
          type="button"
          aria-label="重新載入八強 Deck 統計"
          disabled={loading}
          onClick={() => void refresh()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/50 text-primary disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !report || report.qualifierCount === 0 ? (
        <p className="rounded-xl border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          八強尚未產生；名單確定後會自動建立不可變更的 Deck 快照。
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric value={report.qualifierCount} label="八強選手" />
            <Metric value={report.registeredComboCount} label="登記 Combo" />
            <Metric value={report.trackedBattleCount} label="已記錄局數" />
          </div>

          <div>
            <h3 className="mb-2 text-xs tracking-widest text-muted-foreground">八強 DECK 快照</h3>
            <ul className="mb-3 space-y-1.5">
              {[...report.snapshots]
                .sort(
                  (a, b) =>
                    (a.rank ?? 99) - (b.rank ?? 99) ||
                    a.participantName.localeCompare(b.participantName),
                )
                .map((snapshot) => (
                  <li
                    key={snapshot.playerId}
                    className="rounded-lg border border-border bg-secondary/30 px-3 py-2"
                  >
                    <p className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{snapshot.participantName}</span>
                      {snapshot.rank && (
                        <span className="shrink-0 font-display text-primary">
                          {snapshot.rank === 1 ? "冠軍" : `第 ${snapshot.rank} 名`}
                        </span>
                      )}
                    </p>
                    {snapshot.comboLabels.length ? (
                      snapshot.comboLabels.map((label, index) => (
                        <p
                          key={`${snapshot.playerId}-${index}`}
                          className="mt-1 truncate text-[11px] text-muted-foreground"
                        >
                          {String.fromCharCode(65 + index)} · {label}
                        </p>
                      ))
                    ) : (
                      <p className="mt-1 text-[11px] text-muted-foreground">未登記 Deck</p>
                    )}
                  </li>
                ))}
            </ul>

            <h3 className="mb-2 text-xs tracking-widest text-muted-foreground">零件採用率</h3>
            {report.partUsage.length ? (
              <ul className="space-y-1.5">
                {report.partUsage.slice(0, 12).map((part) => (
                  <li
                    key={part.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
                  >
                    <span className="truncate">
                      {part.name || part.nameEn}{" "}
                      <span className="text-xs text-muted-foreground">{part.code}</span>
                    </span>
                    <span className="font-display text-primary">
                      {Math.round((part.participantCount / report.qualifierCount) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">八強選手尚未登記 Deck。</p>
            )}
          </div>

          {report.comboUsage.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs tracking-widest text-muted-foreground">八強逐局 COMBO</h3>
              <ul className="space-y-1.5">
                {report.comboUsage.map((entry) => (
                  <li
                    key={`${entry.participantName}-${entry.slot}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
                  >
                    <span className="truncate">
                      {entry.participantName} · Combo {String.fromCharCode(64 + entry.slot)}
                    </span>
                    <span className="text-primary">{entry.battles} 局</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            採用率以八強選手人數為分母；同一零件每位選手只計一次。第四局起可重複選擇相同 Combo。
          </p>
        </>
      )}
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-2">
      <p className="font-display text-xl text-primary">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
