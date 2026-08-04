import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Copy, Check, Plus, Flag, Image as ImageIcon, X } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { uploadTournamentLogo } from "@/lib/tournaments";

export function QrRegisterCard() {
  const { currentTournament, startNewTournament, currentAdmin, forceFinishTournament } =
    useTournament();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [img, setImg] = useState("");
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentTournament) {
      setImg("");
      setUrl("");
      return;
    }
    const link = `${window.location.origin}/register?t=${currentTournament.code}`;
    setUrl(link);
    QRCode.toDataURL(link, {
      margin: 1,
      width: 512,
      color: { dark: "#0b0f0d", light: "#ffffff" },
    }).then(setImg);
  }, [currentTournament]);

  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      const logoUrl = logoFile ? await uploadTournamentLogo(logoFile) : null;
      const fail = await startNewTournament(name, logoUrl);
      if (fail) setErr(fail);
      else {
        setName("");
        setLogoFile(null);
        setLogoPreview("");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上傳 logo 失敗");
    } finally {
      setBusy(false);
    }
  };

  const pickLogo = (file: File | null) => {
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : "";
    });
  };

  const end = async () => {
    setEnding(true);
    setErr("");
    const fail = await forceFinishTournament();
    if (fail) setErr(fail);
    setEnding(false);
    setConfirmEnd(false);
  };

  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <QrCode className="h-4 w-4" /> 報名 QR CODE
      </h2>

      {currentTournament && currentTournament.status === "open" ? (
        <>
          <div className="flex items-center gap-2">
            {currentTournament.logo_url && (
              <img
                src={currentTournament.logo_url}
                alt={`${currentTournament.name} logo`}
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            )}
            <p className="text-sm">
              <span className="text-primary">{currentTournament.name}</span> · 代碼{" "}
              <span className="font-display">{currentTournament.code}</span>
            </p>
          </div>
          {img && (
            <img
              src={img}
              alt={`${currentTournament.name} 報名 QR Code`}
              className="mx-auto h-52 w-52 rounded-xl border border-primary/40 bg-white p-2"
            />
          )}
          <p className="text-xs text-muted-foreground">
            每建立一場新賽事都會產生新的 QR Code，舊的 QR Code
            會自動失效；同一場賽事不可重複報名相同名稱。
          </p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/40 text-primary"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "已複製連結" : "複製報名連結"}
          </button>
          {currentAdmin?.isSuper &&
            (confirmEnd ? (
              <div className="space-y-2 rounded-xl border border-destructive/60 bg-destructive/10 p-3">
                <p className="text-xs text-muted-foreground">
                  確定要強制結束「{currentTournament.name}
                  」嗎？結束後將停止報名並以目前戰績產生成績頁。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmEnd(false)}
                    className="min-h-12 rounded-xl border border-border text-sm text-muted-foreground"
                  >
                    取消
                  </button>
                  <button
                    disabled={ending}
                    onClick={() => void end()}
                    className="min-h-12 rounded-xl bg-destructive font-display text-sm text-foreground disabled:opacity-40"
                  >
                    {ending ? "結束中…" : "確定結束"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmEnd(true)}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-destructive/60 text-destructive"
              >
                <Flag className="h-4 w-4" /> 強制結束賽事
              </button>
            ))}
        </>
      ) : currentTournament ? (
        <p className="text-xs text-muted-foreground">
          本場賽事（{currentTournament.name}）已結束，報名 QR Code 已停止顯示。
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">建立一場新賽事後即可產生專屬報名 QR Code。</p>
      )}

      {currentAdmin?.isSuper ? (
        <div className="space-y-2 border-t border-border pt-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="新賽事名稱，例如：0729 週三戰"
            className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
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
                  onClick={() => pickLogo(null)}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-destructive/60 text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button
            disabled={busy || !name.trim()}
            onClick={() => void create()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> 建立新賽事與 QR CODE
          </button>
        </div>
      ) : (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          僅總管理者可以建立新賽事。
        </p>
      )}
    </div>
  );
}
