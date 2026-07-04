/**
 * A single leading slash not followed by another slash or a backslash.
 * Rejects `//evil.com` and `/\evil.com` (both browser-parsed as protocol-
 * relative hosts) and anything without a leading slash at all, which lets
 * `@evil.com` or `https://evil.com` supply their own host/userinfo when
 * appended to an origin.
 */
const SAFE_RELATIVE_PATH = /^\/(?!\/|\\)/;

export function isSafeRedirectPath(
  path: string | null | undefined,
): path is string {
  return typeof path === "string" && path.length > 0 && SAFE_RELATIVE_PATH.test(path);
}
