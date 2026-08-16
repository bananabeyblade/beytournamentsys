import {
  bootstrapSuperadminFn as legacyBootstrap,
  createAdminFn as legacyCreateAdmin,
  createSuperadminFn as legacyCreateSuperadmin,
  getMyRoleFn as legacyGetRole,
  listAdminsFn as legacyListAdmins,
  promoteGoogleOwnerFn as legacyPromoteOwner,
  removeAdminFn as legacyRemoveAdmin,
  removeSuperadminFn as legacyRemoveSuperadmin,
  setAdminPasswordFn as legacySetPassword,
} from "./admin.functions";
import { railwayApi, railwayAuthEnabled } from "./railway-api";

export async function getMyRoleFn() {
  if (!railwayAuthEnabled) return legacyGetRole();
  return railwayApi<{ role: "admin" | "superadmin" | null }>("/api/admin/role");
}
export async function bootstrapSuperadminFn() {
  if (!railwayAuthEnabled) return legacyBootstrap();
  return { ok: true };
}
export async function promoteGoogleOwnerFn() {
  if (!railwayAuthEnabled) return legacyPromoteOwner();
  return { ok: true };
}
export async function listAdminsFn() {
  if (!railwayAuthEnabled) return legacyListAdmins();
  return (await railwayApi<{ admins: unknown[] }>("/api/admin/admins")).admins;
}
export async function listCreatedSuperadminsFn() {
  if (!railwayAuthEnabled) return legacyListAdmins();
  return (await railwayApi<{ admins: unknown[] }>("/api/admin/created-superadmins")).admins;
}
export async function createAdminFn({ data }: { data: { username: string; password: string } }) {
  if (!railwayAuthEnabled) return legacyCreateAdmin({ data });
  await railwayApi("/api/admin/create-admin", {
    method: "POST",
    body: JSON.stringify({ account: data.username, password: data.password, role: "admin" }),
  });
  return { ok: true, message: "管理者帳號已建立" };
}
export async function createSuperadminFn({
  data,
}: {
  data: { account: string; password: string };
}) {
  if (!railwayAuthEnabled) return legacyCreateSuperadmin({ data });
  await railwayApi("/api/admin/create-admin", {
    method: "POST",
    body: JSON.stringify({ account: data.account, password: data.password, role: "superadmin" }),
  });
  return { ok: true };
}

export async function revealAdminPasswordFn({ data }: { data: { userId: string } }) {
  if (!railwayAuthEnabled) return { password: null };
  const params = new URLSearchParams({ userId: data.userId });
  return railwayApi<{ password: string | null }>(`/api/admin/admin-password?${params}`);
}
export async function removeAdminFn({ data }: { data: { userId: string } }) {
  if (!railwayAuthEnabled) return legacyRemoveAdmin({ data });
  return railwayApi("/api/admin/remove-admin", { method: "POST", body: JSON.stringify(data) });
}
export async function removeSuperadminFn({ data }: { data: { userId: string } }) {
  if (!railwayAuthEnabled) return legacyRemoveSuperadmin({ data });
  return railwayApi("/api/admin/remove-admin", { method: "POST", body: JSON.stringify(data) });
}
export async function setAdminPasswordFn({ data }: { data: { userId: string; password: string } }) {
  if (!railwayAuthEnabled) return legacySetPassword({ data });
  await railwayApi("/api/admin/set-admin-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return { ok: true, message: "密碼已更新" };
}
