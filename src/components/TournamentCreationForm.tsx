import { useRef } from "react";
import { Image as ImageIcon, Plus, X } from "lucide-react";
import { TOURNAMENT_LOGO_ACCEPT } from "@/lib/tournament-logo";

export type CreationFocusTarget = "name" | "logo" | "create" | null;

type TournamentCreationFormProps = {
  name: string;
  onNameChange: (name: string) => void;
  logoPreview?: string;
  onLogoChange: (file: File | null) => void;
  error?: string;
  busy?: boolean;
  onCreate: () => void;
  focusTarget?: CreationFocusTarget;
  buttonLabel?: string;
};

export function TournamentCreationForm({
  name,
  onNameChange,
  logoPreview = "",
  onLogoChange,
  error = "",
  busy = false,
  onCreate,
  focusTarget = null,
  buttonLabel = "建立新賽事與 QR CODE",
}: TournamentCreationFormProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const focusClass = (target: Exclude<CreationFocusTarget, null>) =>
    focusTarget === target ? "landing-live-focus" : "";

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className={`rounded-xl ${focusClass("name")}`}>
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          maxLength={60}
          placeholder="新賽事名稱，例如：0729 週三戰"
          className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
        />
      </div>

      <input
        ref={logoInputRef}
        type="file"
        accept={TOURNAMENT_LOGO_ACCEPT}
        className="hidden"
        onChange={(event) => onLogoChange(event.target.files?.[0] ?? null)}
      />
      <div className={`flex items-center gap-2 rounded-xl ${focusClass("logo")}`}>
        <button
          type="button"
          onClick={() => logoInputRef.current?.click()}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-sm text-muted-foreground"
        >
          <ImageIcon className="h-4 w-4" />
          {logoPreview ? "更換 logo" : "上傳賽事 logo（選填）"}
        </button>
        {logoPreview && (
          <>
            <img
              src={logoPreview}
              alt="logo 預覽"
              className="h-12 w-12 shrink-0 rounded-xl border border-border object-cover"
            />
            <button
              type="button"
              aria-label="移除 logo"
              onClick={() => onLogoChange(null)}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-destructive/60 text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className={`rounded-xl ${focusClass("create")}`}>
        <button
          disabled={busy || !name.trim()}
          onClick={onCreate}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> {buttonLabel}
        </button>
      </div>
    </div>
  );
}
