import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Owner-only: reads the admin audit trail. The table has no SELECT policy, so
 * this server function (service role, after verifying the caller's email) is
 * the only way to read it.
 */
export const listAuditLogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        action: z.string().trim().max(60).optional(),
        tournamentName: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { isOwnerEmail } = await import("./account-id");
    if (!isOwnerEmail(context.claims.email as string | undefined)) {
      throw new Error("Forbidden: 僅限擁有者查看操作紀錄");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("admin_actions")
      .select("id,actor_email,action,detail,tournament_name,created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.action) query = query.eq("action", data.action);
    if (data.tournamentName) query = query.eq("tournament_name", data.tournamentName);
    const { data: rows, error } = await query;
    if (error) throw new Error("無法讀取操作紀錄");
    return rows ?? [];
  });
