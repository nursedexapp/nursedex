import "server-only";
import crypto from "node:crypto";

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify an `Authorization: Bearer <secret>` header against an env-sourced
 * secret. Fails closed if the secret is unset (otherwise the expected
 * string becomes the literal "Bearer undefined", which any caller could
 * send). Comparison is constant-time to avoid a timing side channel.
 */
export function verifyBearerSecret(
  headerValue: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !headerValue) return false;
  return timingSafeStringEqual(headerValue, `Bearer ${secret}`);
}

/**
 * Verify a raw shared-secret header (e.g. `x-admin-secret`) against an
 * env-sourced secret. Same fail-closed + constant-time behavior as
 * verifyBearerSecret, without the "Bearer " prefix.
 */
export function verifySecretHeader(
  headerValue: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !headerValue) return false;
  return timingSafeStringEqual(headerValue, secret);
}
