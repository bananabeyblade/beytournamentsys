import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminRole = "admin" | "superadmin";

/** Reads the caller's roles using their own token (RLS applies). */
export async function getRolesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminRole[]> {
  const { data, error } = await supabase
    .from("admin_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("無法讀取權限");
  return (data ?? []).map((r) => r.role as AdminRole);
}

/** Throws unless the caller holds an admin (or superadmin) role. */
export async function requireAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  needSuper = false,
): Promise<AdminRole[]> {
  const roles = await getRolesForUser(supabase, userId);
  if (!roles.length) throw new Error("Forbidden: 需要管理者權限");
  if (needSuper && !roles.includes("superadmin")) {
    throw new Error("Forbidden: 需要總管理者權限");
  }
  return roles;
}
