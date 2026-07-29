import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public: checks whether a name is already used inside ONE tournament.
 * Returns a boolean only — no registration data is exposed.
 */
export const nameTakenFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ tournamentId: z.string().uuid(), name: z.string().trim().min(1).max(40) })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("registrations")
      .select("id,name")
      .eq("tournament_id", data.tournamentId);
    if (error) throw new Error("檢查失敗");
    const key = data.name.trim().toLowerCase();
    return { taken: (rows ?? []).some((r) => r.name.trim().toLowerCase() === key) };
  });
