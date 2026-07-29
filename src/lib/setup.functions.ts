import { createServerFn } from "@tanstack/react-start";

/**
 * Public, boolean-only check used by the first-run setup wizard.
 * Reveals no account data — only whether the superadmin seat is still open.
 */
export const superadminExistsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("admin_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "superadmin");
  if (error) throw new Error("無法檢查總管理者狀態");
  return { exists: (count ?? 0) > 0 };
});
