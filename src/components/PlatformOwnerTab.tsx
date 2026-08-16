import { Crown } from "lucide-react";
import { useTournament } from "@/lib/tournament-store";
import { SystemStatusCard } from "./SystemStatusCard";

/**
 * Platform diagnostics are deliberately kept outside the normal event
 * settings area. Only the Google platform owner can open this tab.
 */
export function PlatformOwnerTab() {
  const { isOwner } = useTournament();

  if (!isOwner) return null;

  return (
    <div className="space-y-4">
      <div className="panel flex items-start gap-3 p-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/60 bg-accent/30 text-primary">
          <Crown className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-sm text-foreground">開發者 DEVELOPER</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            此頁僅供平台維護使用；一般總管理者、裁判與參賽者不會看到系統狀態資訊。
          </p>
        </div>
      </div>
      <SystemStatusCard />
    </div>
  );
}
