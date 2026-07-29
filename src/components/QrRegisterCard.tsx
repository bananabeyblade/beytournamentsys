import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QrCode, Copy, Check } from "lucide-react";

export function QrRegisterCard() {
  const [url, setUrl] = useState("");
  const [img, setImg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const link = `${window.location.origin}/register`;
    setUrl(link);
    QRCode.toDataURL(link, {
      margin: 1,
      width: 512,
      color: { dark: "#0b0f0d", light: "#ffffff" },
    }).then(setImg);
  }, []);

  return (
    <div className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <QrCode className="h-4 w-4" /> 報名 QR CODE
      </h2>
      {img && (
        <img
          src={img}
          alt="賽事報名 QR Code"
          className="mx-auto h-52 w-52 rounded-xl border border-primary/40 bg-white p-2"
        />
      )}
      <p className="text-xs text-muted-foreground">
        參賽者掃描後可自行填寫名稱報名，報名資料會出現在「選手」頁的待審核名單。
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
    </div>
  );
}
