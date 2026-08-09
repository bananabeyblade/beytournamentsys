import { createServerFn } from "@tanstack/react-start";

/**
 * Public, boolean-only check used by the first-run setup wizard.
 * Reveals no account data — only whether the superadmin seat is still open.
 */
export const superadminExistsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Plain limited SELECT (no HEAD/count request) — the count-only variant sends
  // a body-less HEAD that the edge runtime's fetch shim cannot parse.
  const { data, error } = await supabaseAdmin
    .from("admin_roles")
    .select("id")
    .eq("role", "superadmin")
    .limit(1);
  if (error) {
    console.error("[setup] superadminExists failed", error.code, error.message, error.details);
    throw new Error("無法檢查總管理者狀態");
  }
  return { exists: (data?.length ?? 0) > 0 };
});
