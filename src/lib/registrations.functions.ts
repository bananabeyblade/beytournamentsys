import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admins only: list pending QR sign-ups for one tournament. */
export const listRegistrationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ tournamentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("registrations")
      .select("id,name,created_at")
      .eq("tournament_id", data.tournamentId)
      .order("created_at", { ascending: true });
    if (error) throw new Error("無法讀取報名資料");
    return rows ?? [];
  });

/** Admins only: returns recovery codes for the selected tournament. */
export const listParticipantRecoveryCodesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ tournamentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("participant_recovery_codes")
      .select("name,recovery_code")
      .eq("tournament_id", data.tournamentId)
      .order("created_at", { ascending: true });
    if (error) throw new Error("無法載入選手驗證碼");
    return rows ?? [];
  });

/** Admins only: approve (after adding the player) or reject a sign-up. */
export const deleteRegistrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid(), keepRecoveryCode: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: registration, error: readError } = await supabaseAdmin
      .from("registrations")
      .select("tournament_id,name")
      .eq("id", data.id)
      .maybeSingle();
    if (readError || !registration || !registration.tournament_id) {
      throw new Error("找不到報名資料");
    }
    if (!data.keepRecoveryCode) {
      const { error: codeError } = await supabaseAdmin
        .from("participant_recovery_codes")
        .delete()
        .eq("tournament_id", registration.tournament_id)
        .ilike("name", registration.name);
      if (codeError) throw new Error("無法移除選手驗證碼");
    }
    const { error } = await supabaseAdmin.from("registrations").delete().eq("id", data.id);
    if (error) throw new Error("刪除失敗");
    return { ok: true };
  });

/** Admins only: clear a whole batch of sign-ups in one round trip. */
export const deleteRegistrationsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("registrations").delete().in("id", data.ids);
    if (error) throw new Error("刪除失敗");
    return { ok: true, count: data.ids.length };
  });
