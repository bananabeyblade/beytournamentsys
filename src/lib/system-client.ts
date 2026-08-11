import { superadminExistsFn as legacySuperadminExists } from "./setup.functions";
import { systemStatusFn as legacySystemStatus, type SystemStatus } from "./system-status.functions";
import { railwayApi, railwayAuthEnabled } from "./railway-api";

export async function superadminExistsFn() {
  if (!railwayAuthEnabled) return legacySuperadminExists();
  return { exists: true };
}

export async function systemStatusFn(): Promise<SystemStatus> {
  if (!railwayAuthEnabled) return legacySystemStatus();
  const started = performance.now();
  try {
    const result = await railwayApi<{ ok: boolean }>("/health/database");
    return {
      superadminExists: true,
      dbOk: result.ok === true,
      latencyMs: Math.round(performance.now() - started),
      serverTime: Date.now(),
      errorCode: result.ok ? undefined : "DATABASE_UNHEALTHY",
    };
  } catch {
    return {
      superadminExists: true,
      dbOk: false,
      latencyMs: Math.round(performance.now() - started),
      serverTime: Date.now(),
      errorCode: "UNREACHABLE",
    };
  }
}

export type { SystemStatus } from "./system-status.functions";
