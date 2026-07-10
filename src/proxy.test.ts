// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// proxy.ts reads SITE_PASSWORD into a module-level constant at import time
// (not per-request). Static imports are hoisted above ordinary statements,
// so a plain `process.env.SITE_PASSWORD = ...` textually before the import
// still runs too late; only vi.hoisted() is guaranteed to run first.
const h = vi.hoisted(() => {
  process.env.SITE_PASSWORD = "secret";
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

  it("CSP allows Supabase, Sentry, Turnstile, and blog embed origins", async () => {
    const res = await proxy(fakeRequest("/nurses"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.supabase\.co/);
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
});
