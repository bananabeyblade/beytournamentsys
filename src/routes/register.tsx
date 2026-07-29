import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus, Check } from "lucide-react";
import { addRegistration } from "@/lib/registration";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "掃碼報名 | Beyblade X 賽事系統" },
      {
        name: "description",
        content: "掃描賽事 QR Code 後填寫名稱即可完成 Beyblade X 賽事報名，由裁判審核加入選手名單。",
      },
      { property: "og:title", content: "掃碼報名 | Beyblade X 賽事系統" },
      {
        property: "og:description",
        content: "填寫名稱完成 Beyblade X 賽事報名，裁判審核後即進入選手名單。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await addRegistration(name);
      setName("");
      setDone(true);

    } catch {
      setErr("送出失敗，請確認網路後再試一次。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div>
        <h1 className="font-display text-2xl neon-text">賽事報名</h1>
        <p className="text-[11px] tracking-widest text-muted-foreground">
          BEYBLADE X · PLAYER REGISTRATION
        </p>
      </div>

      {done ? (
        <div className="panel space-y-3 p-4 text-center">
          <Check className="mx-auto h-10 w-10 text-primary" />
          <p className="font-display text-lg">報名已送出</p>
          <p className="text-sm text-muted-foreground">請等待裁判於現場確認加入選手名單。</p>
          <button
            onClick={() => {
              setName("");
              setDone(false);
            }}
            className="min-h-12 w-full rounded-xl border border-primary/60 bg-accent/40 text-primary"
          >
            再報名一位
          </button>
        </div>
      ) : (
        <div className="panel space-y-3 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            name="beyx-player-name"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
            placeholder="選手名稱 / 暱稱"
            className="min-h-14 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
          />

          {err && <p className="text-sm text-destructive">{err}</p>}
          <button
            disabled={!name.trim() || busy}
            onClick={submit}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
          >
            <UserPlus className="h-5 w-5" /> {busy ? "送出中…" : "送出報名"}
          </button>
        </div>
      )}
    </main>
  );
}
