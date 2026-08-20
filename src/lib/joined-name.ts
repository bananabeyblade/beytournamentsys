import { useEffect, useState } from "react";

export const JOINED_NAME_KEY = "beyx-joined-name";
export const JOINED_NAME_EVENT = "beyx-joined-name-change";
export const JOINED_TOURNAMENT_KEY = "beyx-joined";
export const JOINED_RECOVERY_CODE_KEY = "beyx-joined-recovery-code";

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

/**
 * Keep the participant recovery credential only on the device that completed
 * registration/recovery. It is scoped to the same tournament as the saved
 * name so the participant can update their Deck from the live event view.
 */
export function writeJoinedRecoveryCode(code: string) {
  if (typeof window === "undefined") return;
  const clean = code.trim();
  if (clean) window.localStorage.setItem(JOINED_RECOVERY_CODE_KEY, clean);
  else window.localStorage.removeItem(JOINED_RECOVERY_CODE_KEY);
  window.dispatchEvent(new Event(JOINED_NAME_EVENT));
}

/** Remove the QR identity stored for this browser. */
export function clearJoinedRegistration() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(JOINED_TOURNAMENT_KEY);
  window.localStorage.removeItem(JOINED_RECOVERY_CODE_KEY);
  writeJoinedName("");
}

/** A participant name is only meaningful inside its exact QR tournament. */
export function readJoinedNameForTournament(tournamentCode?: string): string {
  if (!tournamentCode) return "";
  const expected = tournamentCode.trim().toUpperCase();
  return readJoinedTournamentCode() === expected ? readJoinedName().trim() : "";
}

/** Recovery credential belonging to this browser's currently joined event. */
export function readJoinedRecoveryCodeForTournament(tournamentCode?: string): string {
  if (typeof window === "undefined" || !tournamentCode) return "";
  const expected = tournamentCode.trim().toUpperCase();
  if (readJoinedTournamentCode() !== expected) return "";
  return (window.localStorage.getItem(JOINED_RECOVERY_CODE_KEY) ?? "").trim();
}

/** Name this browser registered with for the displayed QR tournament. */
export function useJoinedName(tournamentCode?: string): string {
  const [name, setName] = useState("");

  useEffect(() => {
    const sync = () => setName(readJoinedNameForTournament(tournamentCode));
    sync();
    window.addEventListener(JOINED_NAME_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener(JOINED_NAME_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [tournamentCode]);

  return name;
}

export function isSameName(a: string, b: string) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}
