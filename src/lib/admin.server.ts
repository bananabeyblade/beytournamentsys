import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminRole = "admin" | "superadmin";

/** Reads the caller's roles using their own token (RLS applies). */
export async function getRolesForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminRole[]> {
  const { data, error } = await supabase.from("admin_roles").select("role").eq("user_id", userId);
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

/** Turns Supabase Auth's English errors into a message we can show the user. */
export function friendlyAuthError(message?: string | null): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("already been registered") || m.includes("already exists")) {
    return "此帳號已被使用，請改用其他帳號名稱";
  }
  if (m.includes("password")) return "密碼不符合安全要求，請改用更長或更複雜的密碼";
  if (m.includes("invalid") && m.includes("email")) return "帳號格式不正確";
  return "建立帳號失敗，請稍後再試";
}

