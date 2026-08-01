import { createServerFn } from "@tanstack/react-start";

export type SystemStatus = {
  superadminExists: boolean;
  dbOk: boolean;
  latencyMs: number;
  serverTime: number;
  errorCode?: string;
};

/**
 * Lightweight, boolean-only health probe for the admin system status panel.
 * Never throws: a failure returns dbOk:false so the panel can render a red
 * state instead of blanking the page.
 */
export const systemStatusFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SystemStatus> => {
    const startedAt = Date.now();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Plain limited SELECT (no count/head request) — count-only queries send a
      // body-less HEAD that the edge runtime's fetch shim cannot parse.
      const { data, error } = await supabaseAdmin
        .from("admin_roles")
        .select("id")
        .eq("role", "superadmin")
        .limit(1);

      if (error) {
        console.error("[status] db probe failed", error.code, error.message, error.details);
        return {
          superadminExists: false,
          dbOk: false,
          latencyMs: Date.now() - startedAt,
          serverTime: Date.now(),
          errorCode: error.code || "DB_ERROR",
        };
      }

      return {
        superadminExists: (data?.length ?? 0) > 0,
        dbOk: true,
        latencyMs: Date.now() - startedAt,
        serverTime: Date.now(),
      };
    } catch (e) {
      console.error("[status] db probe threw", e);
      return {
        superadminExists: false,
        dbOk: false,
        latencyMs: Date.now() - startedAt,
        serverTime: Date.now(),
        errorCode: "UNREACHABLE",
      };
    }
  },
);
