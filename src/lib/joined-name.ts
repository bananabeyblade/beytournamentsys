import { useEffect, useState } from "react";

export const JOINED_NAME_KEY = "beyx-joined-name";
export const JOINED_NAME_EVENT = "beyx-joined-name-change";
export const JOINED_TOURNAMENT_KEY = "beyx-joined";

export function readJoinedTournamentCode(): string {
  if (typeof window === "undefined") return "";
  return (window.localStorage.getItem(JOINED_TOURNAMENT_KEY) ?? "").trim().toUpperCase();
}

export function writeJoinedTournamentCode(code: string) {
  if (typeof window === "undefined") return;
  const clean = code.trim().toUpperCase();
  if (clean) window.localStorage.setItem(JOINED_TOURNAMENT_KEY, clean);
  else window.localStorage.removeItem(JOINED_TOURNAMENT_KEY);
}

function readJoinedName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(JOINED_NAME_KEY) ?? "";
}

export function writeJoinedName(name: string) {
  if (typeof window === "undefined") return;
  const clean = name.trim();
  if (clean) window.localStorage.setItem(JOINED_NAME_KEY, clean);
  else window.localStorage.removeItem(JOINED_NAME_KEY);
  window.dispatchEvent(new Event(JOINED_NAME_EVENT));
}

/** Name the spectator registered with, kept in sync across tabs and updates. */
export function useJoinedName(): string {
  const [name, setName] = useState("");

  useEffect(() => {
    const sync = () => setName(readJoinedName());
    sync();
    window.addEventListener(JOINED_NAME_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(JOINED_NAME_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return name;
}

export function isSameName(a: string, b: string) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}
