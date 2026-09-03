import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OWNER_EMAIL } from "./account-id";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type OwnerClaims = {
  email?: unknown;
  app_metadata?: { provider?: unknown; providers?: unknown };
};

/**
 * Lovable OAuth sessions do not always copy `app_metadata.provider` into the
 * access-token claims. Query the authenticated user as the source of truth,
 * while retaining the claim check as a fast fallback.
 */
async function isGoogleOwner(
  supabase: SupabaseClient<Database>,
  userId: string,
  claims: unknown,
): Promise<boolean> {
  const data = claims as OwnerClaims;
  const email = String(data.email ?? "")
    .trim()
    .toLowerCase();
  if (email !== OWNER_EMAIL) return false;

  const claimProviders = data.app_metadata?.providers;
  if (
    data.app_metadata?.provider === "google" ||
    (Array.isArray(claimProviders) && claimProviders.includes("google"))
  ) {
    return true;
  }

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  return (
    user?.id === userId &&
    user.email?.trim().toLowerCase() === OWNER_EMAIL &&
    user.identities?.some((identity) => identity.provider === "google") === true
  );
}

async function requireGoogleOwner(
  supabase: SupabaseClient<Database>,
  userId: string,
  claims: unknown,
) {
  if (!(await isGoogleOwner(supabase, userId, claims))) {
    throw new Error("Forbidden: Google owner account required");
  }
}

const usernamePassword = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]{3,30}$/, "帳號僅能使用英數字、底線、點與連字號（3-30 字）"),
  password: z.string().min(4, "密碼至少需 4 碼").max(200),
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
    await requireGoogleOwner(context.supabase, context.userId, context.claims);
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

/** Assigns the verified Google owner the superadmin role and retires the legacy password role. */
export const promoteGoogleOwnerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isGoogleOwner(context.supabase, context.userId, context.claims))) {
      return { promoted: false };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: removeError } = await supabaseAdmin
      .from("admin_roles")
      .delete()
      .eq("email", OWNER_EMAIL)
      .eq("role", "superadmin")
      .neq("user_id", context.userId);
    if (removeError) throw new Error("Unable to replace the legacy owner role");

    const { error: grantError } = await supabaseAdmin
      .from("admin_roles")
      .upsert(
        { user_id: context.userId, email: OWNER_EMAIL, role: "superadmin" },
        { onConflict: "user_id,role" },
      );
    if (grantError) throw new Error("Unable to grant the Google owner role");
    return { promoted: true };
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
  .validator((data: unknown) => usernamePassword.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin, friendlyAuthError } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId, true);
    const { toLoginEmail } = await import("./account-id");
    const { padAdminPassword } = await import("./admin-password");
    const email = toLoginEmail(data.username.toLowerCase()).toLowerCase();
    const password = padAdminPassword(data.password);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The login account may already exist (e.g. it is a superadmin, or an
    // orphan auth user left behind). Resolve that before creating anything.
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list.data?.users.find((u) => u.email?.toLowerCase() === email) ?? null;

    // Expected validation problems are RETURNED (not thrown) so the UI shows a
    // hint instead of the runtime error overlay.
    let userId: string;
    if (existing) {
      const roles = await supabaseAdmin
        .from("admin_roles")
        .select("role")
        .eq("user_id", existing.id);
      const held = (roles.data ?? []).map((r) => String(r.role));
      if (held.includes("superadmin")) {
        return {
          ok: false as const,
          message: "此帳號已存在（目前為總管理者），請改用其他帳號名稱",
        };
      }
      if (held.includes("admin")) {
        return {
          ok: false as const,
          message: "此帳號已存在（目前為管理者），請改用其他帳號或使用清單中的「重設密碼」",
        };
      }
      // Auth user without any role: reuse it and set the given password.
      userId = existing.id;
      const updated = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
      });
      if (updated.error) {
        return { ok: false as const, message: friendlyAuthError(updated.error.message) };
      }
    } else {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        return { ok: false as const, message: friendlyAuthError(created.error?.message) };
      }
      userId = created.data.user.id;
    }

    const { error } = await supabaseAdmin.from("admin_roles").insert({
      user_id: userId,
      email,
      role: "admin",
    });
    if (error) return { ok: false as const, message: "授予管理者權限失敗" };
    return { ok: true as const };
  });

/** Superadmin only: reset another admin's password. */
export const setAdminPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(4, "密碼至少需 4 碼").max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin, friendlyAuthError } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId, true);
    const { padAdminPassword } = await import("./admin-password");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: padAdminPassword(data.password),
    });
    if (error) return { ok: false as const, message: friendlyAuthError(error.message) };
    return { ok: true as const };
  });

/** Superadmin only: revoke an admin (superadmins cannot be revoked here). */
export const removeAdminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
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

const ownerOnly = (email: unknown) => {
  const v = String(email ?? "")
    .trim()
    .toLowerCase();
  if (v !== OWNER_EMAIL) throw new Error("Forbidden: 僅限擁有者操作");
};

/** Owner only: create another superadmin (email or custom username login). */
export const createSuperadminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        account: z
          .string()
          .trim()
          .min(3)
          .refine(
            (v) =>
              v.includes("@")
                ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
                : /^[a-zA-Z0-9_.-]{3,30}$/.test(v),
            "請輸入有效的信箱或帳號（英數字、底線、點、連字號 3-30 字）",
          ),
        password: z.string().min(8).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireGoogleOwner(context.supabase, context.userId, context.claims);
    const { toLoginEmail } = await import("./account-id");
    const email = toLoginEmail(data.account).toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId: string | null = null;
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
    });
    if (created.data.user) {
      userId = created.data.user.id;
    } else {
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list.data?.users.find((u) => u.email?.toLowerCase() === email);
      if (!found) throw new Error(created.error?.message ?? "建立帳號失敗");
      userId = found.id;
      if (data.password) {
        await supabaseAdmin.auth.admin.updateUserById(userId, { password: data.password });
      }
    }
    const existing = await supabaseAdmin
      .from("admin_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "superadmin")
      .maybeSingle();
    if (!existing.data) {
      const { error } = await supabaseAdmin
        .from("admin_roles")
        .insert({ user_id: userId, email, role: "superadmin" });
      if (error) throw new Error("授予總管理者權限失敗");
    }
    return { ok: true };
  });

/** Owner only: revoke a superadmin (the owner cannot be revoked). */
export const removeSuperadminFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireGoogleOwner(context.supabase, context.userId, context.claims);
    if (data.userId === context.userId) throw new Error("不可移除自己");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("admin_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "superadmin");
    if (error) throw new Error("移除總管理者失敗");
    return { ok: true };
  });
