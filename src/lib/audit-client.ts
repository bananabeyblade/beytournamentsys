import { listAuditLogFn as legacyListAudit } from "./audit.functions";
import { railwayApi, railwayAuthEnabled } from "./railway-api";

export async function listAuditLogFn({
  data,
}: {
  data: { action?: string; tournamentName?: string; limit?: number };
}) {
  if (!railwayAuthEnabled) return legacyListAudit({ data });
  const search = new URLSearchParams();
  if (data.action) search.set("action", data.action);
  if (data.tournamentName) search.set("tournamentName", data.tournamentName);
  if (data.limit) search.set("limit", String(data.limit));
  return (await railwayApi<{ actions: unknown[] }>(`/api/admin/audit?${search}`)).actions;
}
