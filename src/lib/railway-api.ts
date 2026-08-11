export const railwayAuthEnabled = import.meta.env.VITE_RAILWAY_AUTH_ENABLED === "true";

export async function railwayApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const value = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || `HTTP_${response.status}`);
  return value;
}
