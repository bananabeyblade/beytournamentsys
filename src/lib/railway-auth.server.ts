import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";
import { OWNER_EMAIL } from "./account-id";
import { enforceRateLimit } from "./rate-limit.server";
import { ensureLegacyOwnerForVerifiedGoogleUser } from "./tenant-onboarding.server";

const SESSION_COOKIE = "beyx_session";
export const REFEREE_SESSION_COOKIE = "beyx_referee_session";
const OAUTH_STATE_COOKIE = "beyx_oauth_state";
const OAUTH_VERIFIER_COOKIE = "beyx_oauth_verifier";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_SECONDS = 60 * 10;
type AppRole = "admin" | "superadmin" | "referee";

export interface RailwaySessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: AppRole | null;
  isGoogle: boolean;
  /** The single Google-authenticated platform developer account. */
  isDeveloper: boolean;
  tournamentId?: string;
  tournamentCode?: string;
  refereeStatus?: "pending" | "approved" | "rejected" | "revoked";
}

const base64url = (value: Buffer) => value.toString("base64url");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function secureCookie(name: string, value: string, maxAge: number, path = "/"): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name: string, path = "/"): string {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function safeEqual(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeLoginAccount(value: string): string | null {
  const account = value.trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(account)) return account;
  if (/^[a-z0-9_.-]{3,30}$/.test(account)) return `${account}@beyx.local`;
  return null;
}

function requiredEnv(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || url.host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function publicOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : requestOrigin(request);
}

export function googleCallbackUrl(request: Request): string {
  return `${publicOrigin(request)}/api/auth/google/callback`;
}

export function beginGoogleOAuth(request: Request): Response {
  const canonicalOrigin = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (canonicalOrigin && requestOrigin(request).toLowerCase() !== canonicalOrigin.toLowerCase()) {
    return Response.redirect(`${canonicalOrigin}/api/auth/google`, 302);
  }
  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.searchParams.set("client_id", requiredEnv("GOOGLE_CLIENT_ID"));
  authorization.searchParams.set("redirect_uri", googleCallbackUrl(request));
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");
  authorization.searchParams.set("prompt", "select_account");

  const headers = new Headers({ location: authorization.toString(), "cache-control": "no-store" });
  headers.append(
    "set-cookie",
    secureCookie(OAUTH_STATE_COOKIE, state, OAUTH_SECONDS, "/api/auth/google"),
  );
  headers.append(
    "set-cookie",
    secureCookie(OAUTH_VERIFIER_COOKIE, verifier, OAUTH_SECONDS, "/api/auth/google"),
  );
  return new Response(null, { status: 302, headers });
}

async function exchangeGoogleCode(request: Request, code: string, verifier: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: googleCallbackUrl(request),
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  const tokens = (await response.json()) as { access_token?: string };
  if (!tokens.access_token)
    throw new Error("Google token response did not include an access token");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok)
    throw new Error(`Google profile request failed (${profileResponse.status})`);
  const profile = (await profileResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (!profile.sub || !profile.email || profile.email_verified !== true)
    throw new Error("Google account does not have a verified email address");
  return {
    subject: profile.sub,
    email: profile.email.trim().toLowerCase(),
    displayName: profile.name?.trim() || null,
  };
}

async function upsertGoogleUser(
  client: PoolClient,
  profile: Awaited<ReturnType<typeof exchangeGoogleCode>>,
) {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM app_users
      WHERE google_subject = $1 OR lower(email) = lower($2)
      ORDER BY (google_subject = $1) DESC LIMIT 1`,
    [profile.subject, profile.email],
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE app_users SET google_subject = $2,
         display_name = COALESCE($3, display_name), last_login_at = now() WHERE id = $1`,
      [existing.rows[0].id, profile.subject, profile.displayName],
    );
    return existing.rows[0].id;
  }
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO app_users (email, google_subject, display_name, last_login_at)
     VALUES ($1, $2, $3, now()) RETURNING id`,
    [profile.email, profile.subject, profile.displayName],
  );
  return inserted.rows[0].id;
}

export async function finishGoogleOAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const expectedState = cookieValue(request, OAUTH_STATE_COOKIE);
  const verifier = cookieValue(request, OAUTH_VERIFIER_COOKIE);
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", clearCookie(OAUTH_STATE_COOKIE, "/api/auth/google"));
  headers.append("set-cookie", clearCookie(OAUTH_VERIFIER_COOKIE, "/api/auth/google"));

  if (url.searchParams.has("error") || !safeEqual(state, expectedState) || !verifier) {
    headers.set("location", "/?auth=failed");
    return new Response(null, { status: 302, headers });
  }
  const code = url.searchParams.get("code");
  if (!code) {
    headers.set("location", "/?auth=failed");
    return new Response(null, { status: 302, headers });
  }

  try {
    const profile = await exchangeGoogleCode(request, code, verifier);
    const token = base64url(randomBytes(32));
    await withPostgresTransaction(async (client) => {
      const userId = await upsertGoogleUser(client, profile);
      await ensureLegacyOwnerForVerifiedGoogleUser(client, {
        id: userId,
        email: profile.email,
        googleSubject: profile.subject,
      });
      await client.query(
        `INSERT INTO app_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 days')`,
        [userId, sha256(token)],
      );
      await client.query("DELETE FROM app_sessions WHERE expires_at <= now()");
    });
    headers.append("set-cookie", secureCookie(SESSION_COOKIE, token, SESSION_SECONDS));
    headers.set("location", "/?auth=success");
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("[auth/google] callback failed", error);
    headers.set("location", "/?auth=failed");
    return new Response(null, { status: 302, headers });
  }
}

export async function loginRailwayWithPassword(request: Request): Promise<Response> {
  try {
    await enforceRateLimit(request, "admin-login", 10, 15 * 60);
    const body = (await request.json().catch(() => null)) as {
      account?: unknown;
      password?: unknown;
    } | null;
    const email = typeof body?.account === "string" ? normalizeLoginAccount(body.account) : null;
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || password.length < 8 || password.length > 200 || email === OWNER_EMAIL)
      throw Object.assign(new Error("INVALID_CREDENTIALS"), { status: 401 });

    const result = await queryPostgres<{ id: string }>(
      `SELECT u.id FROM app_users u
       WHERE lower(u.email)=lower($1) AND u.password_hash IS NOT NULL
         AND u.password_hash = crypt($2, u.password_hash)
         AND EXISTS (SELECT 1 FROM admin_roles r WHERE r.user_id=u.id)
       LIMIT 1`,
      [email, password],
    );
    if (!result.rows[0]) throw Object.assign(new Error("INVALID_CREDENTIALS"), { status: 401 });

    const token = base64url(randomBytes(32));
    await withPostgresTransaction(async (client) => {
      await client.query(
        `INSERT INTO app_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 days')`,
        [result.rows[0].id, sha256(token)],
      );
      await client.query("UPDATE app_users SET last_login_at=now() WHERE id=$1", [
        result.rows[0].id,
      ]);
      await client.query("DELETE FROM app_sessions WHERE expires_at <= now()");
    });
    return Response.json(
      { ok: true },
      {
        headers: {
          "set-cookie": secureCookie(SESSION_COOKIE, token, SESSION_SECONDS),
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 500;
    const code = status === 500 ? "LOGIN_FAILED" : (error as Error).message;
    if (status === 500) console.error("[auth/password] login failed", error);
    return Response.json({ error: code }, { status, headers: { "cache-control": "no-store" } });
  }
}

export async function readRailwaySession(request: Request): Promise<RailwaySessionUser | null> {
  let signedInUser: RailwaySessionUser | null = null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) {
    const result = await queryPostgres<{
      id: string;
      email: string;
      display_name: string | null;
      google_subject: string | null;
      role: AppRole | null;
    }>(
      `SELECT u.id, u.email, u.display_name, u.google_subject,
       CASE WHEN bool_or(r.role = 'superadmin') THEN 'superadmin'::app_role
            WHEN bool_or(r.role = 'admin') THEN 'admin'::app_role ELSE NULL END AS role
     FROM app_sessions s JOIN app_users u ON u.id = s.user_id
     LEFT JOIN admin_roles r ON r.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     GROUP BY u.id, u.email, u.display_name, u.google_subject`,
      [sha256(token)],
    );
    const row = result.rows[0];
    if (row) {
      signedInUser = {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        isGoogle: Boolean(row.google_subject),
        isDeveloper: row.email.trim().toLowerCase() === OWNER_EMAIL && Boolean(row.google_subject),
      };
      if (row.role) return signedInUser;
    }
  }

  const refereeToken = cookieValue(request, REFEREE_SESSION_COOKIE);
  if (!refereeToken) return signedInUser;
  const referee = await queryPostgres<{
    id: string;
    display_name: string;
    status: "approved";
    tournament_id: string;
    code: string;
  }>(
    `SELECT r.id,r.display_name,r.status,r.tournament_id,t.code
     FROM tournament_referees r
     JOIN tournament_referee_invites i ON i.id=r.invite_id
     JOIN tournaments t ON t.id::text=r.tournament_id::text
     WHERE r.session_token_hash=$1 AND r.status='approved' AND t.status='open'
       AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > now())
     LIMIT 1`,
    [sha256(refereeToken)],
  );
  const row = referee.rows[0];
  if (!row) return signedInUser;
  void queryPostgres("UPDATE tournament_referees SET last_seen_at=now() WHERE id=$1", [row.id]);
  return {
    id: row.id,
    email: row.display_name,
    displayName: row.display_name,
    role: "referee",
    isGoogle: false,
    isDeveloper: false,
    tournamentId: row.tournament_id,
    tournamentCode: row.code,
    refereeStatus: "approved",
  };
}

export async function readRailwayRefereeClaim(request: Request) {
  const token = cookieValue(request, REFEREE_SESSION_COOKIE);
  if (!token) return null;
  const result = await queryPostgres<{
    id: string;
    display_name: string;
    status: "pending" | "approved" | "rejected" | "revoked";
    tournament_id: string;
    code: string;
    name: string;
  }>(
    `SELECT r.id,r.display_name,r.status,r.tournament_id,t.code,t.name
     FROM tournament_referees r JOIN tournaments t ON t.id::text=r.tournament_id::text
     WHERE r.session_token_hash=$1 LIMIT 1`,
    [sha256(token)],
  );
  return result.rows[0] ?? null;
}

export async function requireRailwayOperator(request: Request, tournamentId: string) {
  const user = await readRailwaySession(request);
  if (!user) throw Object.assign(new Error("AUTH_REQUIRED"), { status: 401 });
  if (user.role === "admin" || user.role === "superadmin") return user;
  if (user.role === "referee" && user.tournamentId === tournamentId) return user;
  throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
}

export function refereeSessionCookie(token: string) {
  return secureCookie(REFEREE_SESSION_COOKIE, token, SESSION_SECONDS);
}

export async function requireRailwayAdmin(
  request: Request,
  superadminOnly = false,
): Promise<RailwaySessionUser> {
  const user = await readRailwaySession(request);
  if (!user) throw Object.assign(new Error("AUTH_REQUIRED"), { status: 401 });
  if (
    (user.role !== "admin" && user.role !== "superadmin") ||
    (superadminOnly && user.role !== "superadmin")
  ) {
    throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  }
  return user;
}

export async function requireRailwayOwner(request: Request): Promise<RailwaySessionUser> {
  const user = await requireRailwayAdmin(request, true);
  if (user.email.toLowerCase() !== OWNER_EMAIL || !user.isGoogle)
    throw Object.assign(new Error("OWNER_REQUIRED"), { status: 403 });
  return user;
}

export async function logoutRailwaySession(request: Request): Promise<Response> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await queryPostgres("DELETE FROM app_sessions WHERE token_hash = $1", [sha256(token)]);
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", clearCookie(SESSION_COOKIE));
  headers.append("set-cookie", clearCookie(REFEREE_SESSION_COOKIE));
  return Response.json({ ok: true }, { headers });
}
