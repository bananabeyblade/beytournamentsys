import { useEffect, useState } from "react";
import { Save, UserPlus } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { addRegistration, isNameTaken } from "@/lib/registration";
import { supabase } from "@/integrations/supabase/client";

/** Lets a referee keep a player display name and enter the active event normally. */
export function AdminPlayerRegistration() {
  const { currentTournament } = useTournament();
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      const saved = data.user?.user_metadata?.player_name;
      if (mounted && typeof saved === "string") {
        setName(saved);
        setSavedName(saved);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const cleanName = () => name.trim().replace(/\s+/g, " ");

  const saveName = async () => {
    const clean = cleanName();
    if (!clean) {
      setMessage({ ok: false, text: "請輸入參賽名稱。" });
      return false;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { player_name: clean } });
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error.message });
      return false;
    }
    setName(clean);
    setSavedName(clean);
    setMessage({ ok: true, text: "參賽名稱已儲存。" });
    return true;
  };

  const register = async () => {
    if (!currentTournament || currentTournament.status !== "open") {
      setMessage({ ok: false, text: "目前沒有開放報名中的賽事。" });
      return;
    }
    const clean = cleanName();
    if (!clean) {
      setMessage({ ok: false, text: "請先設定參賽名稱。" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (clean !== savedName && !(await saveName())) return;
      if (await isNameTaken(currentTournament.id, clean)) {
        setMessage({ ok: false, text: "這個名稱已在本場賽事報名。" });
        return;
      }
      await addRegistration(currentTournament.id, clean);
      setMessage({ ok: true, text: "已送出報名，請到「選手」頁審核後加入名單。" });
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof Error && error.message === "DUPLICATE"
            ? "這個名稱已在本場賽事報名。"
            : "報名失敗，請再試一次。",
      });
    } finally {
      setBusy(false);
    }
  };

  const eventOpen = currentTournament?.status === "open";
  return (
    <section className="panel space-y-3 p-3">
      <h2 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
        <UserPlus className="h-4 w-4" /> 管理者參賽
      </h2>
      <p className="text-xs text-muted-foreground">
        設定自己的參賽名稱後，可直接送出目前賽事的報名；報名會和 QR 報名一樣進入待審核清單。
      </p>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={40}
        placeholder="例如：John"
        className="min-h-12 w-full rounded-xl border border-input bg-input/40 px-3 outline-none focus:border-primary"
      />
      {message && (
        <p className={`text-xs ${message.ok ? "text-primary" : "text-destructive"}`}>
          {message.text}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || !cleanName() || cleanName() === savedName}
          onClick={() => void saveName()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-sm disabled:opacity-40"
        >
          <Save className="h-4 w-4" /> 儲存名稱
        </button>
        <button
          type="button"
          disabled={busy || !cleanName() || !eventOpen}
          onClick={() => void register()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary font-display text-primary-foreground disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4" /> {eventOpen ? "直接報名" : "尚無開放賽事"}
        </button>
      </div>
    </section>
  );
}
