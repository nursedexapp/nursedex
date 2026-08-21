import { describe, it, expect } from "vitest";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_NAME, authCookieOptions } from "./auth-cookie";

// supabase-js derives its auth storage key from the URL's hostname:
//   sb-${hostname.split(".")[0]}-auth-token
// So moving the project onto a custom domain silently RENAMES the cookie every
// browser is holding, and every signed-in user is signed out at once (#735).
// Proof it is hostname-derived, already in this repo: e2e/.auth/*.json hold
// "sb-127-auth-token", from http://127.0.0.1:54321.
//
// These tests pin the RULE (the cookie name must not move when the URL moves),
// not the rendering of any one call site.

const LEGACY_URL = "https://fisuhtkzhyttdmqoivlp.supabase.co";
const CUSTOM_DOMAIN_URL = "https://auth.nursedex.com";
const KEY = "sb_publishable_key_used_only_by_this_test";

/** The cookie name a client actually looks for, read off the real library. */
function storageKeyFor(url: string, options = {}): string {
  const client = createServerClient(url, KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
    ...options,
  });
  return (client.auth as unknown as { storageKey: string }).storageKey;
}

describe("Supabase auth cookie name", () => {
  it("is the same on the custom domain as on the legacy project host", () => {
    // The whole point: a user holding a cookie minted before the cutover must
    // still be recognised after it.
    expect(storageKeyFor(CUSTOM_DOMAIN_URL, authCookieOptions())).toBe(
      storageKeyFor(LEGACY_URL, authCookieOptions()),
    );
  });

  it("is the name live browsers are already holding", () => {
    // Pinning to the WRONG name would sign everyone out just as thoroughly as
    // not pinning at all, so assert the exact value in the wild, not merely
    // that the two agree with each other.
    expect(storageKeyFor(CUSTOM_DOMAIN_URL, authCookieOptions())).toBe(
      "sb-fisuhtkzhyttdmqoivlp-auth-token",
    );
    expect(AUTH_COOKIE_NAME).toBe("sb-fisuhtkzhyttdmqoivlp-auth-token");
  });

  it("is a no-op today, which is what makes it safe to deploy alone", () => {
    // Before the URL changes, the pinned value must be byte-identical to the
    // derived one. If this fails, deploying the pin is itself a mass logout.
    expect(storageKeyFor(LEGACY_URL, authCookieOptions())).toBe(
      storageKeyFor(LEGACY_URL),
    );
  });

  it("still moves with the hostname when NOT pinned", () => {
    // A positive control. Without it, the three assertions above would pass
    // just as happily against a library that never derived the key at all, and
    // this guard would be defending against nothing.
    expect(storageKeyFor(CUSTOM_DOMAIN_URL)).toBe("sb-auth-auth-token");
    expect(storageKeyFor(LEGACY_URL)).toBe("sb-fisuhtkzhyttdmqoivlp-auth-token");
  });
});
