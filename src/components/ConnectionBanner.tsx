import { WifiOff, Wifi } from "lucide-react";
import { useConnection } from "@/hooks/use-connection";

/** Shows an offline warning and a short "reconnected" confirmation. */
export function ConnectionBanner() {
  const { online, justReconnected } = useConnection();

  if (online && !justReconnected) return null;

  return (
    <div
      role="status"
      className={`sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold ${
        online ? "bg-accent/60 text-primary" : "bg-destructive/90 text-foreground"
      }`}
    >
      {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {online ? "已重新連線，資料已同步" : "連線中斷，正在自動重新連線…目前顯示最後同步的賽況"}
    </div>
  );
}
