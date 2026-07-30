import { FINISHES, type Match, type Player } from "./tournament-types";
import type { TournamentRow } from "./tournaments";

const pad = (n: number, w: number) => String(n).padStart(w, " ");

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-TW", { hour12: false });
}

function roundLabel(round: number, total: number) {
  const back = total - round;
  if (back === 1) return "決賽";
  if (back === 2) return "準決賽";
  if (back === 3) return "半準決賽";
  return `第 ${round + 1} 輪`;
}

const ORDINAL = ["1st", "2nd", "3rd", "4th"];

/** Builds a shareable plain-text record of a tournament (podium, roster, per-point log). */
export function buildTournamentText(row: TournamentRow): string {
  const live = row.live_state as unknown as {
    players?: Player[];
    matches?: Match[];
    tableCount?: number;
  } | null;
  const players = live?.players ?? [];
  const matches = live?.matches ?? [];
  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? "—";

  const L: string[] = [];
  L.push("==============================");
  L.push("竹塹陀螺集會所 BEYBLADE X 賽事紀錄");
  L.push("==============================");
  L.push(`賽事名稱：${row.name}`);
  L.push(`賽事代碼：${row.code}`);
  L.push(`狀態：${row.status === "finished" ? "已結束" : "進行中（快照）"}`);
  L.push(`建立時間：${fmt(row.created_at)}`);
  if (row.status === "finished") L.push(`結束時間：${fmt(row.finished_at)}`);
  L.push(`參賽人數：${row.results?.playerCount ?? players.length}`);
  L.push("");

  if (row.results?.top4?.length) {
    L.push("------ 最終名次 ------");
    for (const e of row.results.top4) {
      L.push(`${ORDINAL[e.rank - 1] ?? `${e.rank}th`}  ${e.name}`);
    }
    L.push("");
  }

  if (players.length) {
    L.push("------ 參賽者名單 ------");
    players.forEach((p, i) => L.push(`${pad(i + 1, 2)}. ${p.name}`));
    L.push("");
  }

  if (matches.length) {
    const total = Math.max(...matches.map((m) => m.round)) + 1;
    L.push("------ 賽程紀錄 ------");
    for (let r = 0; r < total; r++) {
      const list = matches.filter((m) => m.round === r).sort((a, b) => a.index - b.index);
      if (!list.length) continue;
      L.push(`[${roundLabel(r, total)}]`);
      list.forEach((m, i) => {
        const table = m.table != null ? ` (桌 ${m.table})` : "";
        const win = m.winner ? `   勝：${nameOf(m.winner)}` : "";
        L.push(
          `  M${i + 1}${table}  ${nameOf(m.p1)} ${m.score1} : ${m.score2} ${nameOf(m.p2)}${win}`,
        );
        let s1 = 0;
        let s2 = 0;
        for (const ev of m.events ?? []) {
          const f = FINISHES.find((x) => x.type === ev.type);
          if (ev.slot === 1) s1 += ev.points;
          else s2 += ev.points;
          const who = ev.slot === 1 ? nameOf(m.p1) : nameOf(m.p2);
          L.push(`      └ ${who} ${f?.label ?? ev.type} +${ev.points} (${s1}:${s2})`);
        }
      });
      L.push("");
    }
  } else {
    L.push("------ 賽程紀錄 ------");
    L.push("無詳細賽程紀錄。");
    L.push("");
  }

  L.push("==============================");
  L.push(`匯出時間：${fmt(new Date().toISOString())}`);
  return L.join("\n");
}

export function exportFileName(row: TournamentRow) {
  const date = new Date(row.created_at).toISOString().slice(0, 10);
  const safe = row.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "tournament";
  return `${safe}_${row.code}_${date}.txt`;
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
