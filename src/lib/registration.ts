import { supabase } from "@/integrations/supabase/client";
import {
  deleteRegistrationFn,
  deleteRegistrationsFn,
  listParticipantRecoveryCodesFn,
  listRegistrationsFn,
} from "./registrations.functions";
import { nameTakenFn } from "./registration-check.functions";
import { railwayApi, railwayAuthEnabled } from "./railway-api";

export interface Registration {
  id: string;
  name: string;
  at: number;
}

export interface ParticipantRecoveryCode {
  name: string;
  code: string;
}

/** Admin-only: reads go through an authorized server function. */
export async function fetchRegistrations(tournamentId: string): Promise<Registration[]> {
  if (railwayAuthEnabled) {
    const result = await railwayApi<{
      registrations: Array<{ id: string; name: string; created_at: string }>;
    }>(`/api/admin/registrations?tournamentId=${encodeURIComponent(tournamentId)}`);
    return result.registrations.map((r) => ({
      id: r.id,
      name: r.name,
      at: new Date(r.created_at).getTime(),
    }));
  }
  const rows = await listRegistrationsFn({ data: { tournamentId } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    at: new Date(r.created_at).getTime(),
  }));
}

/** Public: checks for a duplicate name inside the same QR session. */
export async function isNameTaken(tournamentId: string, name: string) {
  if (railwayAuthEnabled) {
    return (
      await railwayApi<{ taken: boolean }>(
        `/api/registrations?tournamentId=${encodeURIComponent(tournamentId)}&name=${encodeURIComponent(name.trim())}`,
      )
    ).taken;
  }
  const { taken } = await nameTakenFn({ data: { tournamentId, name: name.trim() } });
  return taken;
}

/** Public: anyone scanning the QR code of an open tournament may submit a name. */
export async function addRegistration(tournamentId: string, name: string): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error("NAME_REQUIRED");
  if (railwayAuthEnabled) {
    return (
      await railwayApi<{ recoveryCode: string }>("/api/registrations", {
        method: "POST",
        body: JSON.stringify({ tournamentId, name: clean }),
      })
    ).recoveryCode;
  }
  const { data, error } = await supabase.rpc("create_registration_with_recovery_code", {
    _tournament_id: tournamentId,
    _name: clean,
  });
  if (error) {
    if (error.code === "23505") throw new Error("DUPLICATE");
    throw error;
  }
  if (!data) throw new Error("RECOVERY_CODE_UNAVAILABLE");
  return data;
}

/** Admin-only: server verifies the caller's role before deleting. */
export async function deleteRegistration(id: string, keepRecoveryCode: boolean) {
  if (railwayAuthEnabled) {
    await railwayApi("/api/admin/delete-registration", {
      method: "POST",
      body: JSON.stringify({ id, keepRecoveryCode }),
    });
    return;
  }
  await deleteRegistrationFn({ data: { id, keepRecoveryCode } });
}

/** Admin-only: clears many sign-ups per request (batch approval). */
export async function deleteRegistrations(ids: string[]) {
  if (!ids.length) return;
  if (railwayAuthEnabled) {
    await railwayApi("/api/admin/delete-registrations", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    return;
  }
  await deleteRegistrationsFn({ data: { ids } });
}

/** Public: reconnect a browser to an existing participant identity. */
export async function claimParticipantRecoveryCode(
  tournamentId: string,
  name: string,
  code: string,
): Promise<boolean> {
  if (railwayAuthEnabled) {
    return (
      await railwayApi<{ claimed: boolean }>("/api/recovery", {
        method: "POST",
        body: JSON.stringify({ tournamentId, name: name.trim(), recoveryCode: code.trim() }),
      })
    ).claimed;
  }
  const { data, error } = await supabase.rpc("claim_participant_recovery_code", {
    _tournament_id: tournamentId,
    _name: name.trim(),
    _recovery_code: code.trim(),
  });
  if (error) throw error;
  return data === true;
}

/** Admin-only: recovery codes are never read directly by browser clients. */
export async function fetchParticipantRecoveryCodes(
  tournamentId: string,
): Promise<ParticipantRecoveryCode[]> {
  if (railwayAuthEnabled) {
    const result = await railwayApi<{
      recoveryCodes: Array<{ name: string; recovery_code: string }>;
    }>(`/api/admin/recovery-codes?tournamentId=${encodeURIComponent(tournamentId)}`);
    return result.recoveryCodes.map((row) => ({ name: row.name, code: row.recovery_code }));
  }
  const rows = await listParticipantRecoveryCodesFn({ data: { tournamentId } });
  return rows.map((row) => ({ name: row.name, code: row.recovery_code }));
}
