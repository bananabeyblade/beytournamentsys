import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Save } from "lucide-react";
import {
  fetchDeckParts,
  loadParticipantDeck,
  saveParticipantDeck,
  type BeybladePart,
  type DeckCombo,
  type PartType,
} from "@/lib/deck";

const emptyCombo = (slot: 1 | 2 | 3): DeckCombo => ({
  slot,
  mode: "standard",
  bladeId: "",
  ratchetId: "",
  bitId: "",
});

function PartSelect({
  label,
  type,
  value,
  parts,
  optional = false,
  onChange,
}: {
  label: string;
  type: PartType;
  value?: string;
  parts: BeybladePart[];
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => parts.filter((part) => part.partType === type), [parts, type]);
  const selected = options.find((part) => part.id === value);
  const labelFor = (part: BeybladePart) => `${part.name} · ${part.code} (${part.system})`;
  const normalizedQuery = query.toLowerCase().replace(/[\s-]/g, "");
  const matches = options
    .filter((part) =>
      `${part.name} ${part.nameEn} ${part.code} ${part.system}`
        .toLowerCase()
        .replace(/[\s-]/g, "")
        .includes(normalizedQuery),
    )
    .slice(0, 12);

  useEffect(() => {
    if (!open) setQuery(selected ? labelFor(selected) : "");
  }, [open, selected]);

  return (
    <label className="relative block space-y-1 text-left">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={query}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
        }}
        autoComplete="off"
        placeholder={optional ? "搜尋零件，或保留空白" : `搜尋${label}`}
        className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl">
          {optional && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                setQuery("");
                setOpen(false);
              }}
              className="min-h-10 w-full rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              不使用
            </button>
          )}
          {matches.map((part) => (
            <button
              key={part.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(part.id);
                setQuery(labelFor(part));
                setOpen(false);
              }}
              className="min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-accent"
            >
              {labelFor(part)}
              <span className="ml-2 text-xs text-muted-foreground">{part.nameEn}</span>
            </button>
          ))}
          {!matches.length && (
            <p className="px-3 py-3 text-xs text-muted-foreground">找不到符合的零件</p>
          )}
        </div>
      )}
    </label>
  );
}

export function DeckRegistrationPanel({
  tournamentId,
  participantName,
  recoveryCode,
}: {
  tournamentId: string;
  participantName: string;
  recoveryCode: string;
}) {
  const [parts, setParts] = useState<BeybladePart[]>([]);
  const [combos, setCombos] = useState<DeckCombo[]>([emptyCombo(1)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchDeckParts(),
      loadParticipantDeck(tournamentId, participantName, recoveryCode),
    ])
      .then(([availableParts, saved]) => {
        if (!alive) return;
        setParts(availableParts);
        if (saved.length) setCombos(saved);
      })
      .catch(() => alive && setMessage("暫時無法載入零件資料，稍後可用驗證碼重新登入填寫。"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [participantName, recoveryCode, tournamentId]);

  const update = (index: number, patch: Partial<DeckCombo>) =>
    setCombos((current) =>
      current.map((combo, comboIndex) => (comboIndex === index ? { ...combo, ...patch } : combo)),
    );

  const submit = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveParticipantDeck(tournamentId, participantName, recoveryCode, combos);
      setMessage("Deck 已儲存，可使用同一組驗證碼再次修改。 ");
    } catch {
      setMessage("Deck 儲存失敗，請確認每組均已選擇必要零件。 ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 載入 Deck 登錄…
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-primary/40 bg-background/40 p-3 text-left">
      <div>
        <p className="font-display text-base text-primary">賽前 Deck 登錄（選填）</p>
        <p className="text-xs text-muted-foreground">
          最多登錄三組 Combo，之後可用驗證碼回來修改。
        </p>
      </div>
      {combos.map((combo, index) => (
        <details
          key={combo.slot}
          open={index === 0}
          className="rounded-xl border border-border p-3"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between font-display">
            Combo {combo.slot}
            <ChevronDown className="h-4 w-4" />
          </summary>
          <div className="mt-3 grid gap-3">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-1">
              {(["standard", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() =>
                    update(index, {
                      mode,
                      bladeId: "",
                      lockChipId: "",
                      mainBladeId: "",
                      assistBladeId: "",
                      metalBladeId: "",
                      overBladeId: "",
                    })
                  }
                  className={`min-h-10 rounded-lg text-xs ${combo.mode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {mode === "standard" ? "BX／UX Blade" : "CX 自訂 Blade"}
                </button>
              ))}
            </div>
            {combo.mode === "standard" ? (
              <PartSelect
                label="Blade"
                type="blade"
                value={combo.bladeId}
                parts={parts}
                onChange={(bladeId) => update(index, { bladeId })}
              />
            ) : (
              <>
                <PartSelect
                  label="Lock Chip"
                  type="lock_chip"
                  value={combo.lockChipId}
                  parts={parts}
                  onChange={(lockChipId) => update(index, { lockChipId })}
                />
                <PartSelect
                  label="Main Blade"
                  type="main_blade"
                  value={combo.mainBladeId}
                  parts={parts}
                  onChange={(mainBladeId) => update(index, { mainBladeId })}
                />
                <PartSelect
                  label="Assist Blade"
                  type="assist_blade"
                  value={combo.assistBladeId}
                  parts={parts}
                  onChange={(assistBladeId) => update(index, { assistBladeId })}
                />
                <PartSelect
                  label="Metal Blade（選填）"
                  type="metal_blade"
                  value={combo.metalBladeId}
                  parts={parts}
                  optional
                  onChange={(metalBladeId) => update(index, { metalBladeId })}
                />
                <PartSelect
                  label="Over Blade（選填）"
                  type="over_blade"
                  value={combo.overBladeId}
                  parts={parts}
                  optional
                  onChange={(overBladeId) => update(index, { overBladeId })}
                />
              </>
            )}
            <PartSelect
              label="Ratchet"
              type="ratchet"
              value={combo.ratchetId}
              parts={parts}
              onChange={(ratchetId) => update(index, { ratchetId })}
            />
            <PartSelect
              label="Bit"
              type="bit"
              value={combo.bitId}
              parts={parts}
              onChange={(bitId) => update(index, { bitId })}
            />
          </div>
        </details>
      ))}
      {combos.length < 3 && (
        <button
          type="button"
          onClick={() =>
            setCombos((current) => [...current, emptyCombo((current.length + 1) as 1 | 2 | 3)])
          }
          className="min-h-11 w-full rounded-xl border border-primary/50 text-sm text-primary"
        >
          ＋ 新增 Combo
        </button>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={() => void submit()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "儲存中…" : "儲存 Deck"}
      </button>
    </section>
  );
}
