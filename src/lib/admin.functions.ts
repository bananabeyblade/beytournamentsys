import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const usernamePassword = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]{3,30}$/, "帳號僅能使用英數字、底線、點與連字號（3-30 字）"),
  password: z.string().min(8).max(200),
});

/** Current caller's admin role, or null when they are just a viewer. */
export const getMyRoleFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getRolesForUser } = await import("./admin.server");
    const roles = await getRolesForUser(context.supabase, context.userId);
    const isSuper = roles.includes("superadmin");
    return {
      role: isSuper ? ("superadmin" as const) : roles.length ? ("admin" as const) : null,
    };
  });

/** First signed-in user may claim the superadmin seat; afterwards this is closed. */
export const bootstrapSuperadminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("admin_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "superadmin");
    if (error) throw new Error("無法檢查總管理者");
    if ((count ?? 0) > 0) throw new Error("總管理者已存在");
    const { error: insertError } = await supabaseAdmin.from("admin_roles").insert({
      user_id: context.userId,
      email: (context.claims.email as string | undefined) ?? null,
      role: "superadmin",
    });
    if (insertError) throw new Error("設定總管理者失敗");
    return { ok: true };
  });

/** Superadmin only: list every admin account. */
export const listAdminsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_roles")
      .select("id,user_id,email,role")
      .order("created_at", { ascending: true });
    if (error) throw new Error("無法讀取管理者清單");
    return data ?? [];
  });

/** Superadmin only: create a cloud admin account. */
export const createAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => usernamePassword.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId, true);
    const { toLoginEmail } = await import("./account-id");
    const username = data.username.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const created = await supabaseAdmin.auth.admin.createUser({
      email: toLoginEmail(username),
      password: data.password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "建立帳號失敗（帳號可能已存在）");
    }
    const { error } = await supabaseAdmin.from("admin_roles").insert({
      user_id: created.data.user.id,
      email: username,
      role: "admin",
    });
    if (error) throw new Error("授予管理者權限失敗");
    return { ok: true };
  });

/** Superadmin only: reset another admin's password. */
export const setAdminPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error("更新密碼失敗");
    return { ok: true };
  });

/** Superadmin only: revoke an admin (superadmins cannot be revoked here). */
export const removeAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId, true);
    if (data.userId === context.userId) throw new Error("不可移除自己");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "admin");
    if (error) throw new Error("移除管理者失敗");
    return { ok: true };
  });
