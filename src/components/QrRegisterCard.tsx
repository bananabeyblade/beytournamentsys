import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Copy, Check, Plus, Flag } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { uploadTournamentLogo } from "@/lib/tournaments";
import { addRegistration } from "@/lib/registration";
import { TournamentCreationForm } from "@/components/TournamentCreationForm";

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
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");

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

  const addBatchRegistrations = async () => {
    if (!currentTournament) return;
    setBatchBusy(true);
    setBatchResult(null);
    const batchId = Date.now().toString(36).toUpperCase();
    let created = 0;
    let failed = 0;

    for (let index = 1; index <= 64; index += 1) {
      const testName = `QR測試-${batchId}-${String(index).padStart(2, "0")}`;
      try {
        // Use the same public insert function as the QR registration page.
        await addRegistration(currentTournament.id, testName);
        created += 1;
      } catch {
        failed += 1;
      }
    }

    setBatchResult(
      failed ? `已建立 ${created} 筆測試報名；${failed} 筆失敗。` : `已建立 64 筆測試報名。`,
    );
    setBatchBusy(false);
    setConfirmBatch(false);
  };

  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <QrCode className="h-4 w-4" /> 賽事＆報名 QR CODE 生成
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
            (confirmBatch ? (
              <div className="space-y-2 rounded-xl border border-primary/50 bg-accent/20 p-3">
                <p className="text-xs text-muted-foreground">
                  將以 QR 報名相同的寫入流程，新增 64 筆唯一的測試報名資料。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmBatch(false)}
                    className="min-h-11 rounded-xl border border-border text-sm text-muted-foreground"
                  >
                    取消
                  </button>
                  <button
                    disabled={batchBusy}
                    onClick={() => void addBatchRegistrations()}
                    className="min-h-11 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
                  >
                    {batchBusy ? "建立中…" : "建立 64 筆"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                disabled={batchBusy}
                onClick={() => setConfirmBatch(true)}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/30 text-primary disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> 批次建立 64 筆測試報名
              </button>
            ))}
          {batchResult && <p className="text-xs text-primary">{batchResult}</p>}
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
        <TournamentCreationForm
          name={name}
          onNameChange={setName}
          logoPreview={logoPreview}
          onLogoChange={pickLogo}
          error={err}
          busy={busy}
          onCreate={() => void create()}
        />
      ) : (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          僅總管理者可以建立新賽事。
        </p>
      )}
    </div>
  );
}
