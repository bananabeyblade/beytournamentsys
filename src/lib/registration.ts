import { supabase } from "@/integrations/supabase/client";

export interface Registration {
  id: string;
  name: string;
  at: number;
}

export async function fetchRegistrations(): Promise<Registration[]> {
  const { data, error } = await supabase
    .from("registrations")
    .select("id,name,created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    at: new Date(r.created_at).getTime(),
  }));
}

export async function addRegistration(name: string) {
  const clean = name.trim();
  if (!clean) return;
  const { error } = await supabase.from("registrations").insert({ name: clean });
  if (error) throw error;
}

export async function deleteRegistration(id: string, passcode: string) {
  await deleteRegistrationFn({ data: { id, passcode } });
}
