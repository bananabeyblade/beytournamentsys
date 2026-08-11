import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { queryPostgres, withPostgresTransaction } from "@/integrations/postgres/client.server";

const SESSION_COOKIE = "beyx_session";
const OAUTH_STATE_COOKIE = "beyx_oauth_state";
const OAUTH_VERIFIER_COOKIE = "beyx_oauth_verifier";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_SECONDS = 60 * 10;

type AppRole = "admin" | "superadmin";

export interface RailwaySessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: AppRole | null;
  isGoogle: boolean;
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

export async function readRailwaySession(request: Request): Promise<RailwaySessionUser | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
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
  return row
    ? {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        isGoogle: Boolean(row.google_subject),
      }
    : null;
}

export async function logoutRailwaySession(request: Request): Promise<Response> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await queryPostgres("DELETE FROM app_sessions WHERE token_hash = $1", [sha256(token)]);
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": clearCookie(SESSION_COOKIE), "cache-control": "no-store" } },
  );
}
