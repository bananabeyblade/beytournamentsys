import { supabase } from "@/integrations/supabase/client";
import { deleteRegistrationFn, listRegistrationsFn } from "./registrations.functions";
import { nameTakenFn } from "./registration-check.functions";

export interface Registration {
  id: string;
  name: string;
  at: number;
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
export async function addRegistration(tournamentId: string, name: string) {
  const clean = name.trim();
  if (!clean) return;
  const { error } = await supabase
    .from("registrations")
    .insert({ name: clean, tournament_id: tournamentId });
  if (error) {
    if (error.code === "23505") throw new Error("DUPLICATE");
    throw error;
  }
}

/** Admin-only: server verifies the caller's role before deleting. */
export async function deleteRegistration(id: string) {
  await deleteRegistrationFn({ data: { id } });
}
