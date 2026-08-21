/**
 * The name of the cookie holding a signed-in user's session.
 *
 * supabase-js does not take this name from anywhere stable: it DERIVES it from
 * the hostname of the Supabase URL, as `sb-${hostname.split(".")[0]}-auth-token`.
 * So the cookie every logged-in browser is holding is an accident of the
 * project ref, and pointing the app at a different host silently renames the
 * cookie the app looks for. Nothing errors. Every session simply stops being
 * found, and every user is signed out at once (#735).
 *
 * That is not a hypothetical: this repo's own committed e2e sessions
 * (e2e/.auth/*.json) hold "sb-127-auth-token", derived from
 * http://127.0.0.1:54321.
 *
 * So the name is pinned here as a LITERAL, deliberately not derived from any
 * environment variable. Deriving it from the configured URL would reintroduce
 * exactly the coupling this exists to break, and reading it from an env var
 * would mean a missing value silently logs everyone out.
 *
 * It reads as a stale project ref because it IS one: it is the name already
 * sitting in real browsers, and it has to keep being that name for as long as
 * any of those sessions can still be presented. Do not "tidy" it to match the
 * current domain. Changing this value signs out every user.
 */
export const AUTH_COOKIE_NAME = "sb-fisuhtkzhyttdmqoivlp-auth-token";

/**
 * Client options pinning the session cookie name. Every Supabase client in the
 * app spreads this, because a client that misses it looks for a different
 * cookie than the others and logs those users out on its own.
 */
export function authCookieOptions() {
  return { cookieOptions: { name: AUTH_COOKIE_NAME } };
}
