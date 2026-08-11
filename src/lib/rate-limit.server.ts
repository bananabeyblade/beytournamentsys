import { createHash, randomInt } from "node:crypto";
import { queryPostgres } from "@/integrations/postgres/client.server";

function clientAddress(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function keyHash(request: Request, discriminator: string): string {
  return createHash("sha256")
    .update(`${clientAddress(request)}\n${discriminator.trim().toLowerCase()}`)
    .digest("hex");
}

/**
 * PostgreSQL-backed limiter shared by every Railway replica. The raw IP and
 * participant/account name are hashed before storage.
 */
export async function enforceRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
  discriminator = "global",
): Promise<void> {
  const result = await queryPostgres<{ request_count: number; reset_at: string }>(
    `INSERT INTO request_rate_limits(scope,key_hash,request_count,reset_at)
     VALUES($1,$2,1,now() + $3::int * interval '1 second')
     ON CONFLICT(scope,key_hash) DO UPDATE SET
       request_count = CASE
         WHEN request_rate_limits.reset_at <= now() THEN 1
         ELSE request_rate_limits.request_count + 1
       END,
       reset_at = CASE
         WHEN request_rate_limits.reset_at <= now() THEN now() + $3::int * interval '1 second'
         ELSE request_rate_limits.reset_at
       END
     RETURNING request_count,reset_at`,
    [scope, keyHash(request, discriminator), windowSeconds],
  );

  if (result.rows[0].request_count > limit) {
    throw Object.assign(new Error("TOO_MANY_ATTEMPTS"), {
      status: 429,
      retryAfter: Math.max(
        1,
        Math.ceil((new Date(result.rows[0].reset_at).getTime() - Date.now()) / 1000),
      ),
    });
  }

  // Keep the table bounded without adding cleanup work to every request.
  if (randomInt(100) === 0) {
    void queryPostgres(
      "DELETE FROM request_rate_limits WHERE reset_at < now() - interval '1 day'",
    ).catch(() => undefined);
  }
}
