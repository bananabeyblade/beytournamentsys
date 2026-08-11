import { randomInt } from "node:crypto";

/** Creates the four random digits appended to a tournament's fixed prefix. */
export function generateRecoveryCode(prefix: string): string {
  if (!/^\d{4}$/.test(prefix)) throw new Error("RECOVERY_CODE_PREFIX_INVALID");
  return `${prefix}${randomInt(10_000).toString().padStart(4, "0")}`;
}
