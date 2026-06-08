/**
 * Shared rate-limit helpers. Kept dependency-free (Web Crypto + a pure
 * string parse) so they are easy to unit test and reuse.
 */

/** The first client IP from an x-forwarded-for header, or "unknown". */
export function clientIpFrom(forwardedFor: string | null | undefined): string {
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

/**
 * SHA-256 of the IP with a salt, so stored values cannot be reversed to a
 * raw address. Uses the same RATE_LIMIT_SALT as the waitlist.
 */
export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(
    ip + (process.env.RATE_LIMIT_SALT ?? "nursedex"),
  );
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
