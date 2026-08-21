import { describe, it, expect, vi, beforeEach } from "vitest";
import { AUTH_COOKIE_NAME } from "./auth-cookie";

// Pinning the cookie name (#735) only works if EVERY client does it. A client
// that misses the pin looks for a different cookie than its siblings, so the
// users it serves are signed out on their own, and the bug looks intermittent
// rather than total. So this file asserts the pin reaches all three
// constructors, not just that the constant exists.
//
// Sibling file auth-cookie.test.ts asserts the RULE against the real library.
// This one asserts the WIRING, which is why the library is stubbed here.

const seen: { browser: unknown[]; server: unknown[] } = {
  browser: [],
  server: [],
};

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (_url: string, _key: string, options?: unknown) => {
    seen.browser.push(options);
    return { auth: { getUser: async () => ({ data: { user: null } }) } };
  },
  createServerClient: (_url: string, _key: string, options?: unknown) => {
    seen.server.push(options);
    return { auth: { getUser: async () => ({ data: { user: null } }) } };
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

function pinnedName(options: unknown): string | undefined {
  return (options as { cookieOptions?: { name?: string } } | undefined)
    ?.cookieOptions?.name;
}

beforeEach(() => {
  seen.browser = [];
  seen.server = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth.nursedex.com";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key";
});

describe("every Supabase client pins the session cookie name", () => {
  it("the browser client does", async () => {
    const { createClient } = await import("./client");
    createClient();
    expect(pinnedName(seen.browser[0])).toBe(AUTH_COOKIE_NAME);
  });

  it("the server client does", async () => {
    const { createClient } = await import("./server");
    await createClient();
    expect(pinnedName(seen.server[0])).toBe(AUTH_COOKIE_NAME);
  });

  it("the middleware client does", async () => {
    const { updateSession } = await import("./middleware");
    const { NextRequest } = await import("next/server");
    await updateSession(new NextRequest("https://nursedex.com/dashboard"));
    expect(pinnedName(seen.server[0])).toBe(AUTH_COOKIE_NAME);
  });
});
