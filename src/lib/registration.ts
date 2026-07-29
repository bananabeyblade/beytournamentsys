import { supabase } from "@/integrations/supabase/client";
import { deleteRegistrationFn, listRegistrationsFn } from "./registrations.functions";

export interface Registration {
  id: string;
  name: string;
  at: number;
}

/** Admin-only: reads go through an authorized server function. */
export async function fetchRegistrations(): Promise<Registration[]> {
  const rows = await listRegistrationsFn();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    at: new Date(r.created_at).getTime(),
  }));
}

/** Public: anyone scanning the QR code may submit their name. */
export async function addRegistration(name: string) {
  const clean = name.trim();
  if (!clean) return;
  const { error } = await supabase.from("registrations").insert({ name: clean });
  if (error) throw error;
}

/** Admin-only: server verifies the caller's role before deleting. */
export async function deleteRegistration(id: string) {
  await deleteRegistrationFn({ data: { id } });
}
