export interface RailwayAuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "superadmin" | "referee" | null;
  isGoogle: boolean;
  tournamentId?: string;
  tournamentCode?: string;
}

export const railwayAuthEnabled = import.meta.env.VITE_RAILWAY_AUTH_ENABLED === "true";

export async function fetchRailwaySession(): Promise<RailwayAuthUser | null> {
  const response = await fetch("/api/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("登入狀態讀取失敗");
  const body = (await response.json()) as {
    authenticated?: boolean;
    user?: RailwayAuthUser | null;
  };
  return body.authenticated ? (body.user ?? null) : null;
}

export function startRailwayGoogleLogin(): void {
  window.location.assign("/api/auth/google");
}

export async function loginRailwayWithPassword(account: string, password: string): Promise<void> {
  const response = await fetch("/api/auth/password", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
  if (!response.ok) {
    const value = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(value.error || `HTTP_${response.status}`);
  }
}

export async function logoutRailway(): Promise<void> {
  const response = await fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("登出失敗");
}
