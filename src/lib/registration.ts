export const REG_KEY = "beyx-registrations";

export interface Registration {
  id: string;
  name: string;
  at: number;
}

export function readRegistrations(): Registration[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REG_KEY);
    const list = raw ? (JSON.parse(raw) as Registration[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeRegistrations(list: Registration[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REG_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("beyx-registrations"));
}

export function addRegistration(name: string) {
  const clean = name.trim();
  if (!clean) return;
  const list = readRegistrations();
  list.push({ id: Math.random().toString(36).slice(2, 10), name: clean, at: Date.now() });
  writeRegistrations(list);
}
