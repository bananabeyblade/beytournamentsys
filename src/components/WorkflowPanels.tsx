import {
  Check,
  CheckCheck,
  KeyRound,
  QrCode,
  Shuffle,
  Trash2,
  Trophy,
  UserPlus,
} from "lucide-react";
import { FINISHES, WIN_TARGET } from "@/lib/tournament-types";

export type RegistrationFocusTarget = "name" | "submit" | null;
export type BracketFocusTarget = "tables" | "generate" | null;
export type ScoringFinishTarget = "spin" | "burst" | "xtreme" | null;

export function RegistrationPanel({
  name,
  onNameChange,
  recoveryCode,
  submitted = false,
  onSubmit,
  focusTarget = null,
}: {
  name: string;
  onNameChange: (value: string) => void;
  recoveryCode?: string;
  submitted?: boolean;
  onSubmit: () => void;
  focusTarget?: RegistrationFocusTarget;
}) {
  if (submitted)
    return (
      <div className="landing-registration-complete panel space-y-3 p-4 text-center">
        <Check className="mx-auto h-10 w-10 text-primary" />
        <p className="font-display text-lg">報名已送出</p>
        <p className="text-sm text-muted-foreground">請等待裁判於現場確認加入選手名單。</p>
        {recoveryCode && (
          <div className="rounded-xl border border-primary/60 bg-accent/30 p-3">
            <p className="flex items-center justify-center gap-2 text-sm text-primary">
              <KeyRound className="h-4 w-4" /> 你的參賽者驗證碼
            </p>
            <p className="mt-1 font-display text-3xl tracking-[0.32em] text-primary">
              {recoveryCode}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              請立即截圖保存。若重新整理、換瀏覽器或失去連線，可用此碼找回參賽身分。
            </p>
          </div>
        )}
      </div>
    );
  return (
    <div className="panel space-y-3 p-4">
      <button
        type="button"
        className="min-h-11 w-full rounded-xl border border-primary/60 bg-accent/20 text-sm text-primary"
      >
        已有驗證碼？找回我的參賽身分
      </button>
      <div className={focusTarget === "name" ? "rounded-xl landing-live-focus" : "rounded-xl"}>
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={40}
          placeholder="選手名稱 / 暱稱"
          className="min-h-14 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
      </div>
      <div className={focusTarget === "submit" ? "rounded-xl landing-live-focus" : "rounded-xl"}>
        <button
          type="button"
          disabled={!name.trim()}
          onClick={onSubmit}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
        >
          <UserPlus className="h-5 w-5" /> 送出報名
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        同一場賽事不可使用重複名稱，送出前系統會自動檢查。
      </p>
    </div>
  );
}

export function PendingRegistrationsPanel({ names }: { names: string[] }) {
  return (
    <div className="panel p-3">
      <h2 className="mb-2 flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <QrCode className="h-4 w-4" /> 掃碼報名待審核 ({names.length})
      </h2>
      <button className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground">
        <CheckCheck className="h-5 w-5" /> 全部核准 ({names.length})
      </button>
      <ul className="space-y-2">
        {names.map((name) => (
          <li
            key={name}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg border border-primary/40 bg-accent/20 px-3 py-2"
          >
            <span className="truncate">{name}</span>
            <button
              aria-label={`加入 ${name}`}
              className="grid h-10 w-10 place-items-center rounded-lg border border-primary/60 text-primary"
            >
              <Check className="h-5 w-5" />
            </button>
            <button
              aria-label={`拒絕 ${name}`}
              className="grid h-10 w-10 place-items-center rounded-lg text-destructive"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TournamentSetupPanel({
  tableCount = 3,
  onTableCountChange,
  onGenerate,
  focusTarget = null,
  activeTableControl = null,
  activeGenerate = false,
  generated = false,
}: {
  tableCount?: number;
  onTableCountChange?: (tableCount: number) => void;
  onGenerate?: () => void;
  focusTarget?: BracketFocusTarget;
  activeTableControl?: "increase" | "decrease" | null;
  activeGenerate?: boolean;
  generated?: boolean;
}) {
  return (
    <div className="panel space-y-3 p-3">
      <h2 className="text-sm tracking-widest text-muted-foreground">賽事設定 TOURNAMENT</h2>
      <div className={focusTarget === "tables" ? "rounded-xl landing-live-focus" : "rounded-xl"}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">桌數 TABLES</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="減少桌數"
              onClick={() => onTableCountChange?.(Math.max(1, tableCount - 1))}
              className={`h-11 w-11 rounded-lg border border-border bg-secondary font-display ${activeTableControl === "decrease" ? "landing-control-press" : ""}`}
            >
              −
            </button>
            <span className="w-8 text-center font-display text-xl neon-text">{tableCount}</span>
            <button
              type="button"
              aria-label="增加桌數"
              onClick={() => onTableCountChange?.(Math.min(12, tableCount + 1))}
              className={`h-11 w-11 rounded-lg border border-border bg-secondary font-display ${activeTableControl === "increase" ? "landing-control-press" : ""}`}
            >
              +
            </button>
          </div>
        </div>
      </div>
      <div className={focusTarget === "generate" ? "rounded-xl landing-live-focus" : "rounded-xl"}>
        <button
          type="button"
          onClick={onGenerate}
          className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground ${activeGenerate ? "landing-control-press" : ""}`}
        >
          <Shuffle className="h-5 w-5" /> 隨機產生賽程 RANDOM BRACKET
        </button>
      </div>
      {generated && (
        <p className="text-center text-xs text-primary">賽程已隨機產生，選手名單已鎖定。</p>
      )}
      <button className="min-h-12 w-full rounded-xl border border-primary/50 bg-accent/30 text-primary">
        載入 16 位示範選手
      </button>
    </div>
  );
}

const tones: Record<string, string> = {
  spin: "bg-spin/20 border-spin text-spin",
  over: "bg-over/20 border-over text-over",
  burst: "bg-burst/20 border-burst text-burst",
  xtreme: "bg-xtreme/25 border-xtreme text-xtreme danger-edge",
};

export function ScoringPanel({
  score1 = 3,
  score2 = 2,
  activeSlot = 1,
  activeFinish = null,
  winner = null,
}: {
  score1?: number;
  score2?: number;
  activeSlot?: 1 | 2;
  activeFinish?: ScoringFinishTarget;
  winner?: "A" | "B" | null;
}) {
  return (
    <div className="panel neon-edge p-4">
      <p className="text-xs tracking-widest text-muted-foreground">裁判計分 · 第一輪 · 桌 1</p>
      <h2 className="text-lg neon-text">REFEREE SCORING</h2>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div
          className={`rounded-xl border p-3 text-center transition ${activeSlot === 1 ? "neon-edge bg-accent/40" : "border-border bg-secondary/50"}`}
        >
          <p className="truncate text-sm font-semibold">選手 A</p>
          <p key={score1} className="font-display text-4xl neon-text landing-score-pop">
            {score1}
          </p>
        </div>
        <div className="text-center font-display text-xs text-muted-foreground">VS</div>
        <div
          className={`rounded-xl border p-3 text-center transition ${activeSlot === 2 ? "neon-edge bg-accent/40" : "border-border bg-secondary/50"}`}
        >
          <p className="truncate text-sm font-semibold">選手 B</p>
          <p key={score2} className="font-display text-4xl neon-text landing-score-pop">
            {score2}
          </p>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        先取 {WIN_TARGET} 分獲勝 · 目前為{" "}
        <span className="text-primary">選手 {activeSlot === 1 ? "A" : "B"}</span> 加分
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {FINISHES.map((finish) => (
          <button
            key={finish.type}
            className={`min-h-20 rounded-xl border-2 px-3 py-3 text-left font-semibold ${tones[finish.tone]} ${activeFinish === finish.type ? "landing-score-button-press" : ""}`}
          >
            <span className="font-display text-2xl">+{finish.points}</span>
            <span className="block text-sm">{finish.zh}</span>
            <span className="block text-[11px] opacity-80">{finish.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 min-h-48">
        {winner && (
          <div className="landing-winner-reveal rounded-xl border-2 border-primary bg-accent/40 p-4 text-center neon-edge">
            <Trophy className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 font-display text-lg neon-text">選手 {winner} Wins!</p>
            <p className="text-xs text-muted-foreground">確認後將自動晉級下一輪</p>
            <button className="mt-3 min-h-14 w-full rounded-xl bg-primary font-display text-lg text-primary-foreground">
              確認勝利 CONFIRM
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TournamentResultsPanel({
  names = ["選手 A", "選手 B", "選手 C", "選手 D"],
}: {
  names?: string[];
}) {
  return (
    <div className="panel neon-edge space-y-3 p-4 text-center">
      <Trophy className="mx-auto h-7 w-7 text-primary" />
      <p className="font-display neon-text">賽事完成 · 前四名已產生</p>
      <ol className="space-y-1 text-sm">
        {names.map((name, index) => (
          <li key={name}>
            <span className="font-display text-primary">{index + 1}</span> · {name}
          </li>
        ))}
      </ol>
      <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/40 font-display text-primary">
        查看成績頁面
      </button>
    </div>
  );
}
