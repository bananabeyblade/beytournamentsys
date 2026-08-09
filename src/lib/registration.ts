import { supabase } from "@/integrations/supabase/client";
import {
  deleteRegistrationFn,
  deleteRegistrationsFn,
  listParticipantRecoveryCodesFn,
  listRegistrationsFn,
} from "./registrations.functions";
import { nameTakenFn } from "./registration-check.functions";

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
  const rows = await listRegistrationsFn({ data: { tournamentId } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    at: new Date(r.created_at).getTime(),
  }));
}

/** Public: checks for a duplicate name inside the same QR session. */
export async function isNameTaken(tournamentId: string, name: string) {
  const { taken } = await nameTakenFn({ data: { tournamentId, name: name.trim() } });
  return taken;
}

/** Public: anyone scanning the QR code of an open tournament may submit a name. */
export async function addRegistration(tournamentId: string, name: string): Promise<string> {
  const clean = name.trim();
  if (!clean) throw new Error("NAME_REQUIRED");
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
  await deleteRegistrationFn({ data: { id, keepRecoveryCode } });
}

/** Admin-only: clears many sign-ups per request (batch approval). */
export async function deleteRegistrations(ids: string[]) {
  if (!ids.length) return;
  await deleteRegistrationsFn({ data: { ids } });
}

/** Public: reconnect a browser to an existing participant identity. */
export async function claimParticipantRecoveryCode(
  tournamentId: string,
  name: string,
  code: string,
): Promise<boolean> {
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
  const rows = await listParticipantRecoveryCodesFn({ data: { tournamentId } });
  return rows.map((row) => ({ name: row.name, code: row.recovery_code }));
}
