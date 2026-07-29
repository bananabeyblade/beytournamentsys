import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, Copy, Check } from "lucide-react";

/** Fixed QR code that takes other referees straight to the admin login page. */
export function AdminLoginQrCard() {
  const [url, setUrl] = useState("");
  const [img, setImg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const link = `${window.location.origin}/admin`;
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
        <ShieldCheck className="h-4 w-4" /> 管理者登入 QR CODE
      </h2>
      <p className="text-xs text-muted-foreground">
        固定不變的管理者登入入口，掃描後可直接進入登入畫面（僅總管理者可見）。
      </p>
      {img && (
        <img
          src={img}
          alt="管理者登入 QR Code"
          className="mx-auto h-52 w-52 rounded-xl border border-primary/40 bg-white p-2"
        />
      )}
      <button
        onClick={() => {
          navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/40 text-primary"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "已複製登入連結" : "複製管理者登入連結"}
      </button>
    </div>
  );
}
