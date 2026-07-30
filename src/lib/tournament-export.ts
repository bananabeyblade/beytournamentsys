import { FINISHES, type Match, type Player, type ScoreEvent } from "@/lib/tournament-types";
import type { TournamentRow } from "@/lib/tournaments";

const FINISH_ZH = Object.fromEntries(FINISHES.map((f) => [f.type, f.zh])) as Record<string, string>;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { hour12: false });
}

function roundLabel(round: number, totalRounds: number) {
  const left = totalRounds - round;
  if (left === 1) return "決賽 FINAL";
  if (left === 2) return "四強 SEMI";
  if (left === 3) return "八強 QUARTER";
  return `第 ${round + 1} 輪 R${round + 1}`;
}

const STATUS_ZH: Record<string, string> = {
  waiting: "等待中",
  ready: "待開始",
  live: "比賽中",
  done: "已完成",
};

/** Builds a human-readable plain-text report for one tournament. */
export function buildTournamentReport(row: TournamentRow): string {
  const players = (row.live_state?.players ?? []) as Player[];
  const matches = (row.live_state?.matches ?? []) as Match[];
  const nameOf = (id: string | null) =>
    (id && players.find((p) => p.id === id)?.name) || "待定";

  const lines: string[] = [];
  const bar = "========================================";
  lines.push(bar);
  lines.push(row.name);
  lines.push(`賽事代碼：${row.code}`);
  lines.push(`建立時間：${fmtDate(row.created_at)}`);
  lines.push(`結束時間：${fmtDate(row.finished_at)}`);
  lines.push(
    `狀態：${row.status === "finished" ? "已結束" : "進行中"}　參賽人數：${
      row.results?.playerCount ?? players.length
    }　桌數：${row.live_state?.tableCount ?? "—"}`,
  );
  lines.push(bar);
  lines.push("");

  const top4 = row.results?.top4 ?? [];
  if (top4.length) {
    lines.push("【最終名次】");
    for (const e of top4) lines.push(`  ${e.rank}. ${e.name}`);
    lines.push("");
  }

  if (!players.length && !matches.length) {
    lines.push("此賽事無詳細賽程紀錄。");
    lines.push("");
  } else {
    if (players.length) {
      lines.push("【參賽名單】(依種子序)");
      const sorted = [...players].sort((a, b) => a.seed - b.seed);
      for (const p of sorted) lines.push(`  #${p.seed} ${p.name}`);
      lines.push("");
    }

    if (matches.length) {
      const totalRounds = Math.max(...matches.map((m) => m.round)) + 1;
      lines.push("【賽程紀錄】");
      for (let r = 0; r < totalRounds; r++) {
        const inRound = matches.filter((m) => m.round === r);
        if (!inRound.length) continue;
        lines.push(`■ ${roundLabel(r, totalRounds)}`);
        for (const m of inRound.sort((a, b) => a.index - b.index)) {
          lines.push(
            `  M${m.index + 1}  桌${m.table ?? "—"}  ${STATUS_ZH[m.status] ?? m.status}`,
          );
          const win = m.winner ? `      勝：${nameOf(m.winner)}` : "";
          lines.push(
            `      ${nameOf(m.p1)}  ${m.score1} - ${m.score2}  ${nameOf(m.p2)}${win}`,
          );
          if (m.events?.length) {
            const seq = m.events
              .map(
                (e: ScoreEvent) =>
                  `${nameOf(e.slot === 1 ? m.p1 : m.p2)} ${FINISH_ZH[e.type] ?? e.type}(+${e.points})`,
              )
              .join(" / ");
            lines.push(`      逐球：${seq}`);
          }
        }
        lines.push("");
      }

      const counts: Record<string, number> = {};
      let done = 0;
      for (const m of matches) {
        if (m.status === "done") done++;
        for (const e of m.events ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1;
      }
      lines.push("【統計】");
      lines.push(`  總場次 ${matches.length}　已完成 ${done}`);
      lines.push(
        `  結束勝法：${FINISHES.map((f) => `${f.zh} ${counts[f.type] ?? 0}`).join("　")}`,
      );
      lines.push("");
    }
  }

  lines.push("----------------------------------------");
  lines.push(`匯出時間：${fmtDate(new Date().toISOString())}`);
  return lines.join("\n");
}

export function reportFileName(row: TournamentRow) {
  const d = new Date(row.created_at);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const safe = row.name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "tournament";
  return `${safe}_${stamp}_${row.code}.txt`;
}

/** Triggers a browser download of a UTF-8 text file. */
export function downloadText(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
