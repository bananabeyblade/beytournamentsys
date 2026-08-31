import { useEffect, useMemo, useState } from "react";
import { RotateCcw, X, Trophy, Lock, Unlock, Flag } from "lucide-react";
import { FINISHES, WIN_TARGET, type Match } from "@/lib/tournament-types";
import { useTournament } from "@/lib/tournament-store";
import { fetchDeckReport } from "@/lib/deck-report";
import type { DeckCombo } from "@/lib/deck";
import { isTop8Match } from "@/lib/top8";
import { snapshotSelectedCombo } from "@/lib/recorded-combo";
import { useDeckRegistrationEnabled } from "@/hooks/use-deck-registration-enabled";

type RefereeDeckChoice = {
  combos: DeckCombo[];
  comboLabels: string[];
  bladeLabels: string[];
};

const playerDeckKey = (playerId: string) => `id:${playerId}`;
const participantDeckKey = (name: string) => `name:${name.trim().toLocaleLowerCase()}`;

const toneClass: Record<string, string> = {
  spin: "bg-spin/20 border-spin text-spin",
  over: "bg-over/20 border-over text-over",
  burst: "bg-burst/20 border-burst text-burst",
  xtreme: "bg-xtreme/25 border-xtreme text-xtreme danger-edge",
};

function SlotCard({
  active,
  onClick,
  name,
  score,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  score: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border p-3 text-center transition ${
        active ? "neon-edge bg-accent/40" : "border-border bg-secondary/50"
      }`}
    >
      <p className="truncate text-sm font-semibold">{name}</p>
      <p className="font-display text-4xl neon-text">{score}</p>
    </button>
  );
}

function ComboPicker({
  label,
  combos,
  bladeLabels,
  value,
  onChange,
  disabled,
}: {
  label: string;
  combos: DeckCombo[];
  bladeLabels: string[];
  value?: 1 | 2 | 3;
  onChange: (slot: 1 | 2 | 3) => void;
  disabled: boolean;
}) {
  if (!combos.length) {
    return <p className="text-center text-[11px] text-muted-foreground">{label} 未登記 Deck</p>;
  }
  return (
    <label className="block">
      <span className="mb-1 block text-center text-[11px] text-muted-foreground">
        {label} 本局戰刃
      </span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) as 1 | 2 | 3)}
        className="min-h-10 w-full rounded-lg border border-border bg-secondary px-2 text-center text-sm text-foreground disabled:opacity-50"
      >
        {combos.map((combo, index) => (
          <option key={combo.slot} value={combo.slot}>
            {bladeLabels[index] || "未指定戰刃"}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ScoringModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const {
    playerName,
    addScore,
    undoScore,
    confirmWinner,
    roundName,
    locked,
    role,
    currentAdmin,
    lockInfo,
    acquireMatchLock,
    renewMatchLock,
    releaseMatchLock,
    forceUnlockMatch,
    isOwner,
    matches,
    currentTournament,
  } = useTournament();
  const [slot, setSlot] = useState<1 | 2>(1);
  const [deckByPlayer, setDeckByPlayer] = useState<Record<string, RefereeDeckChoice>>({});
  const [deckLoadError, setDeckLoadError] = useState<string | null>(null);
  const previous = match.events.at(-1);
  const [combo1Slot, setCombo1Slot] = useState<1 | 2 | 3 | undefined>(previous?.combo1Slot);
  const [combo2Slot, setCombo2Slot] = useState<1 | 2 | 3 | undefined>(previous?.combo2Slot);
  const deckRegistrationEnabled = useDeckRegistrationEnabled(currentTournament?.id);
  const top8Tracking = deckRegistrationEnabled && isTop8Match(match, matches);

  useEffect(() => {
    if (!top8Tracking || !currentTournament?.id) return;
    let alive = true;
    const refreshDecks = () => {
      void fetchDeckReport(currentTournament.id)
        .then((report) => {
          if (!alive) return;
          const next: Record<string, RefereeDeckChoice> = {};
          for (const deck of report.refereeDecks ?? []) {
            if (!deck.currentCombos.length) continue;
            const choice = {
              combos: deck.currentCombos,
              comboLabels: deck.comboLabels,
              bladeLabels: deck.comboBladeLabels,
            };
            // A completed bracket can retain an old player id, so always
            // index by name as well as by the currently resolved id.
            next[participantDeckKey(deck.participantName)] = choice;
            if (deck.playerId) next[playerDeckKey(deck.playerId)] = choice;
          }
          // Compatibility fallback for data imported before live roster Deck
          // identities existed.
          for (const snapshot of report.snapshots) {
            const fallbackCombos = snapshot.currentCombos ?? snapshot.combos;
            if (!fallbackCombos.length) continue;
            const choice = {
              combos: fallbackCombos,
              comboLabels: snapshot.currentComboLabels ?? snapshot.comboLabels,
              bladeLabels: snapshot.comboBladeLabels ?? [],
            };
            if (!next[playerDeckKey(snapshot.playerId)]) {
              next[playerDeckKey(snapshot.playerId)] = choice;
            }
            if (!next[participantDeckKey(snapshot.participantName)]) {
              next[participantDeckKey(snapshot.participantName)] = choice;
            }
          }
          setDeckByPlayer(next);
          setDeckLoadError(null);
        })
        .catch((error: unknown) => {
          if (!alive) return;
          // Do not clear a previously loaded Deck map during a transient
          // polling failure. Showing the failure is safer than incorrectly
          // labelling a registered player as having no Deck.
          setDeckLoadError(error instanceof Error ? error.message : "DECK_REPORT_UNAVAILABLE");
        });
    };
    refreshDecks();
    const refreshInterval = window.setInterval(refreshDecks, 3000);
    return () => {
      alive = false;
      window.clearInterval(refreshInterval);
    };
  }, [currentTournament?.id, match.p1, match.p2, top8Tracking]);

  const held = lockInfo(match);
  // Someone else is already scoring this bout: show it read-only instead of
  // letting two referees fight over the same score.
  const heldByOther = !!held && held.by !== currentAdmin?.id;

  // Take the lock on open and keep it alive while the modal stays open.
  useEffect(() => {
    if (role !== "admin" || locked) return;
    acquireMatchLock(match.id);
    const beat = setInterval(() => renewMatchLock(match.id), 10000);
    return () => {
      clearInterval(beat);
      releaseMatchLock(match.id);
    };
  }, [match.id, role, locked, acquireMatchLock, renewMatchLock, releaseMatchLock]);

  const reached = match.score1 >= WIN_TARGET || match.score2 >= WIN_TARGET;
  const frozen = reached || locked || heldByOther;
  const winnerName = match.score1 >= WIN_TARGET ? playerName(match.p1) : playerName(match.p2);
  const findDeck = (playerId: string | null) => {
    if (!playerId) return undefined;
    return (
      deckByPlayer[playerDeckKey(playerId)] ??
      deckByPlayer[participantDeckKey(playerName(playerId))]
    );
  };
  const p1Deck = findDeck(match.p1);
  const p2Deck = findDeck(match.p2);
  const p1Combos = useMemo(() => p1Deck?.combos ?? [], [p1Deck?.combos]);
  const p2Combos = useMemo(() => p2Deck?.combos ?? [], [p2Deck?.combos]);
  useEffect(() => {
    setCombo1Slot((current) =>
      p1Combos.some((combo) => combo.slot === current) ? current : p1Combos[0]?.slot,
    );
    setCombo2Slot((current) =>
      p2Combos.some((combo) => combo.slot === current) ? current : p2Combos[0]?.slot,
    );
  }, [p1Combos, p2Combos]);
  const comboSelectionRequired = top8Tracking && p1Combos.length > 0 && p2Combos.length > 0;
  const comboSelectionReady = !comboSelectionRequired || (!!combo1Slot && !!combo2Slot);
  const selectedComboSnapshots = () =>
    top8Tracking
      ? {
          player1: snapshotSelectedCombo(p1Combos, p1Deck?.comboLabels ?? [], combo1Slot),
          player2: snapshotSelectedCombo(p2Combos, p2Deck?.comboLabels ?? [], combo2Slot),
        }
      : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/85 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="panel neon-edge max-h-[94vh] w-full overflow-y-auto rounded-b-none p-4 sm:max-w-lg sm:rounded-2xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs tracking-widest text-muted-foreground">
              裁判計分 · {roundName(match.round)}
              {match.table ? ` · 桌 ${match.table}` : ""}
            </p>
            <h2 className="truncate text-lg neon-text">REFEREE SCORING</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <SlotCard
            active={slot === 1}
            onClick={() => setSlot(1)}
            name={playerName(match.p1)}
            score={match.score1}
          />
          <div className="text-center font-display text-xs text-muted-foreground">VS</div>
          <SlotCard
            active={slot === 2}
            onClick={() => setSlot(2)}
            name={playerName(match.p2)}
            score={match.score2}
          />
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          先取 {WIN_TARGET} 分獲勝 · 目前為 <span className="text-primary">選手 {slot}</span> 加分
        </p>

        {top8Tracking && (
          <div className="mt-4 rounded-xl border border-primary/50 bg-accent/20 p-3">
            <p className="mb-3 text-center font-display text-xs text-primary">
              TOP 8 · 本局 COMBO 紀錄
            </p>
            <div className="grid grid-cols-2 gap-3">
              <ComboPicker
                label={playerName(match.p1)}
                combos={p1Combos}
                bladeLabels={p1Deck?.bladeLabels ?? []}
                value={combo1Slot}
                onChange={setCombo1Slot}
                disabled={frozen}
              />
              <ComboPicker
                label={playerName(match.p2)}
                combos={p2Combos}
                bladeLabels={p2Deck?.bladeLabels ?? []}
                value={combo2Slot}
                onChange={setCombo2Slot}
                disabled={frozen}
              />
            </div>
            {deckLoadError && (
              <p className="mt-2 text-center text-[11px] text-destructive">
                Deck 資料同步失敗（{deckLoadError}）；請重新整理後再選擇組合。
              </p>
            )}
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              每局可重新選擇；第四局起仍可重複使用 A／B／C。未登記 Deck 不會阻擋計分。
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {FINISHES.map((f) => (
            <button
              key={f.type}
              disabled={frozen || !comboSelectionReady}
              onClick={() => addScore(match.id, slot, f.type, f.points, selectedComboSnapshots())}
              className={`min-h-20 rounded-xl border-2 px-3 py-3 text-left font-semibold disabled:opacity-40 ${toneClass[f.tone]}`}
            >
              <span className="font-display text-2xl">+{f.points}</span>
              <span className="block text-sm">{f.zh}</span>
              <span className="block text-[11px] opacity-80">{f.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => undoScore(match.id)}
          disabled={!match.events.length || locked || heldByOther}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary font-semibold disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5" /> 復原上一步 Undo
        </button>

        {!reached && !locked && !heldByOther && role === "admin" && (
          <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <p className="mb-2 text-center text-[11px] text-muted-foreground">
              參賽者棄權或未到場時，可直接判定勝者（不新增比分）。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 2].map((winnerSlot) => (
                <button
                  key={winnerSlot}
                  type="button"
                  onClick={() => {
                    confirmWinner(match.id, winnerSlot as 1 | 2);
                    onClose();
                  }}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-destructive/50 bg-background/60 px-2 text-xs font-semibold text-destructive"
                >
                  <Flag className="h-4 w-4" /> 判定{" "}
                  {playerName(winnerSlot === 1 ? match.p1 : match.p2)} 勝
                </button>
              ))}
            </div>
          </div>
        )}

        {heldByOther && (
          <div className="mt-3 rounded-xl border border-destructive/60 bg-destructive/10 p-3 text-xs">
            <p className="flex items-center gap-2 font-semibold text-destructive">
              <Lock className="h-4 w-4" /> {held?.name} 正在計分，此局暫為唯讀
            </p>
            <p className="mt-1 text-muted-foreground">對方關閉計分視窗或斷線 30 秒後會自動解鎖。</p>
            {isOwner && (
              <button
                onClick={() => forceUnlockMatch(match.id)}
                className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/60 bg-accent/40 font-semibold text-primary"
              >
                <Unlock className="h-4 w-4" /> 強制解鎖並接手
              </button>
            )}
          </div>
        )}

        {locked && (
          <p className="mt-3 text-center text-xs text-primary">賽事已結束，計分已封存。</p>
        )}
      </div>
      {reached && !locked && !heldByOther && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/65 p-4 backdrop-blur-[2px]">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="winner-confirmation-title"
            className="w-full max-w-sm rounded-xl border-2 border-primary bg-card p-4 text-center neon-edge"
          >
            <Trophy className="mx-auto h-8 w-8 text-primary" />
            <p id="winner-confirmation-title" className="mt-2 font-display text-lg neon-text">
              {winnerName} Wins!
            </p>
            <p className="text-xs text-muted-foreground">確認後將自動晉級下一輪</p>
            <button
              autoFocus
              onClick={() => {
                confirmWinner(match.id);
                onClose();
              }}
              className="mt-3 min-h-14 w-full rounded-xl bg-primary font-display text-lg text-primary-foreground"
            >
              確認勝利 CONFIRM
            </button>
            <button
              type="button"
              onClick={() => undoScore(match.id)}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-sm font-semibold"
            >
              <RotateCcw className="h-4 w-4" /> 返回修正比分
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
