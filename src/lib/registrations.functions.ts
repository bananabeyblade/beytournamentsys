import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Admins only: list pending QR sign-ups. */
export const listRegistrationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("registrations")
      .select("id,name,created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error("無法讀取報名資料");
    return data ?? [];
  });

/** Admins only: approve (after adding the player) or reject a sign-up. */
export const deleteRegistrationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("registrations").delete().eq("id", data.id);
    if (error) throw new Error("刪除失敗");
    return { ok: true };
  });
