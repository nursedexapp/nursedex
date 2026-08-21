// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// proxy.ts reads SITE_PASSWORD into a module-level constant at import time
// (not per-request). Static imports are hoisted above ordinary statements,
// so a plain `process.env.SITE_PASSWORD = ...` textually before the import
// still runs too late; only vi.hoisted() is guaranteed to run first.
const h = vi.hoisted(() => {
  process.env.SITE_PASSWORD = "secret";
  // The CSP's Supabase origin is derived from this, also at import time.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc123.supabase.co";
  return {
    updateSession: vi.fn(async (_req: NextRequest) => NextResponse.next()),
  };
});

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: h.updateSession,
}));

import { proxy } from "./proxy";

function fakeRequest(
  path: string,
  init: { cookies?: Record<string, string> } = {},
): NextRequest {
  const cookieHeader = init.cookies
    ? Object.entries(init.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ")
    : undefined;
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updateSession.mockImplementation(async () => NextResponse.next());
});

describe("proxy security headers (#393)", () => {
  it("sets a Content-Security-Policy with a nonce on the default path", async () => {
    const res = await proxy(fakeRequest("/nurses"));
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/);
  });

  it("generates a different nonce on each invocation", async () => {
    const res1 = await proxy(fakeRequest("/nurses"));
    const res2 = await proxy(fakeRequest("/nurses"));
    const nonce1 = res1.headers
      .get("Content-Security-Policy")
      ?.match(/'nonce-([^']+)'/)?.[1];
    const nonce2 = res2.headers
      .get("Content-Security-Policy")
      ?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce1).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });

  it("forwards the same nonce to the downstream request", async () => {
    const res = await proxy(fakeRequest("/nurses"));
    const cspNonce = res.headers
      .get("Content-Security-Policy")
      ?.match(/'nonce-([^']+)'/)?.[1];
    const forwardedRequest = h.updateSession.mock.calls[0][0] as NextRequest;
    expect(forwardedRequest.headers.get("x-nonce")).toBe(cspNonce);
  });

  it("preserves cookies on the forwarded request", async () => {
    await proxy(fakeRequest("/dashboard", { cookies: { session: "abc" } }));
    const forwardedRequest = h.updateSession.mock.calls[0][0] as NextRequest;
    expect(forwardedRequest.cookies.get("session")?.value).toBe("abc");
  });

  it("sets X-Content-Type-Options, Referrer-Policy, and X-Frame-Options on the default path", async () => {
    const res = await proxy(fakeRequest("/nurses"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  // The CSP names THIS project, not "any Supabase project on the internet".
  // The wildcard it replaced was simultaneously too loose (every other tenant's
  // project was a permitted destination for the browser) and too tight (a local
  // or CI stack is not on *.supabase.co at all, so the browser's upload of a
  // nurse photo straight to storage was blocked, and the onboarding journey
  // could not be tested outside production).
  it("CSP allows the configured Supabase origin, and not the whole of supabase.co", async () => {
    const res = await proxy(fakeRequest("/nurses"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toMatch(/connect-src[^;]*https:\/\/abc123\.supabase\.co/);
    expect(csp).toMatch(/connect-src[^;]*wss:\/\/abc123\.supabase\.co/);
    expect(csp).toMatch(/img-src[^;]*https:\/\/abc123\.supabase\.co/);
    expect(csp).not.toContain("*.supabase.co");
  });

  // A local stack is http://127.0.0.1:54321. If the CSP cannot say so, the
  // browser cannot reach it, and no photo upload can ever be exercised in CI.
  it("CSP allows a local Supabase when that is what the app is pointed at", async () => {
    vi.resetModules();
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";

    try {
      const { proxy: freshProxy } = await import("./proxy");
      const res = await freshProxy(fakeRequest("/nurses"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";

      expect(csp).toMatch(/connect-src[^;]*http:\/\/127\.0\.0\.1:54321/);
      expect(csp).toMatch(/connect-src[^;]*ws:\/\/127\.0\.0\.1:54321/);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
      vi.resetModules();
    }
  });

  // Fail open to the old wildcard, never to a CSP that blocks Supabase outright.
  // A missing env var must not take the whole app down.
  it("CSP falls back to the wildcard when no Supabase URL is configured", async () => {
    vi.resetModules();
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    try {
      const { proxy: freshProxy } = await import("./proxy");
      const res = await freshProxy(fakeRequest("/nurses"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";

      expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.supabase\.co/);
      expect(csp).toMatch(/connect-src[^;]*wss:\/\/\*\.supabase\.co/);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
      vi.resetModules();
    }
  });

  it("CSP allows Sentry, Turnstile, and blog embed origins", async () => {
    const res = await proxy(fakeRequest("/nurses"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(
      /connect-src[^;]*https:\/\/o4511116810584064\.ingest\.us\.sentry\.io/,
    );
    expect(csp).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/www\.youtube\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/player\.vimeo\.com/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("points the CSP at the violation report endpoint (#537)", async () => {
    const res = await proxy(fakeRequest("/nurses"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).toContain("report-to csp-endpoint");
    expect(res.headers.get("Reporting-Endpoints")).toBe(
      'csp-endpoint="/api/csp-report"',
    );
  });

  it("skips the session refresh for a posted CSP report but keeps the headers", async () => {
    const res = await proxy(fakeRequest("/api/csp-report"));
    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(h.updateSession).not.toHaveBeenCalled();
  });

  it("still applies security headers on the stripe webhook skip path", async () => {
    const res = await proxy(fakeRequest("/api/stripe/webhook"));
    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(h.updateSession).not.toHaveBeenCalled();
  });

  it("still applies security headers on a cron path, without calling updateSession", async () => {
    const res = await proxy(fakeRequest("/api/cron/access-expiry"));
    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    expect(h.updateSession).not.toHaveBeenCalled();
  });

  it("still applies security headers on the site-password redirect", async () => {
    const res = await proxy(fakeRequest("/brand"));
    expect(res.status).toBe(307);
    expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
  });

  it("still redirects to /brand-login without a valid site-auth cookie", async () => {
    const res = await proxy(fakeRequest("/brand"));
    expect(res.headers.get("location")).toContain("/brand-login");
  });

  it("still lets a request with the correct site-auth cookie through", async () => {
    const res = await proxy(
      fakeRequest("/brand", { cookies: { "site-auth": "secret" } }),
    );
    expect(res.status).not.toBe(307);
    expect(h.updateSession).toHaveBeenCalled();
  });

  it("redirects a request whose site-auth cookie is present but wrong", async () => {
    const res = await proxy(
      fakeRequest("/brand", { cookies: { "site-auth": "wrong" } }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/brand-login");
    expect(h.updateSession).not.toHaveBeenCalled();
  });
});

// #761. Sentry's session replay compresses events in a Web Worker created from
// a blob URL. The CSP set script-src but no worker-src, so browsers fell back to
// script-src, which does not permit blob:, and the worker was blocked. Measured
// on production 2026-08-21: every visitor got a console error on every page and
// replay was degraded. Loosening a security control, so it is scoped narrowly
// and pinned here rather than left as a line nobody can explain.
describe("CSP worker policy", () => {
  it("allows the blob worker session replay needs", async () => {
    const res = await proxy(fakeRequest("/login"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toMatch(/worker-src[^;]*'self'/);
    expect(csp).toMatch(/worker-src[^;]*blob:/);
  });

  it("does not let blob: leak into script-src", async () => {
    // The lazy fix is adding blob: to script-src, which would permit arbitrary
    // blob SCRIPTS across the whole app rather than just workers. The whole
    // point of naming worker-src is that it stays narrower than that.
    const res = await proxy(fakeRequest("/login"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? "";

    expect(scriptSrc).not.toContain("blob:");
  });

  it("still refuses workers from anywhere else", async () => {
    const res = await proxy(fakeRequest("/login"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const workerSrc = csp.match(/worker-src([^;]*)/)?.[1] ?? "";

    expect(workerSrc).not.toContain("*");
    expect(workerSrc).not.toContain("http");
  });
});
