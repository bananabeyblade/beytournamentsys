import { useEffect, useState } from "react";

export const RECONNECT_EVENT = "beyx-reconnect";

/**
 * Tracks browser connectivity and emits a global reconnect event so data
 * subscribers can immediately re-sync after the network comes back.
 */
export function useConnection() {
  const [online, setOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);

    let timer: ReturnType<typeof setTimeout> | undefined;

    const goOnline = () => {
      setOnline(true);
      setJustReconnected(true);
      window.dispatchEvent(new Event(RECONNECT_EVENT));
      timer = setTimeout(() => setJustReconnected(false), 2500);
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { online, justReconnected };
}

/** Subscribe to reconnect notifications (network restored). */
export function useOnReconnect(handler: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => handler();
    window.addEventListener(RECONNECT_EVENT, fn);
    return () => window.removeEventListener(RECONNECT_EVENT, fn);
  }, [handler]);
}
