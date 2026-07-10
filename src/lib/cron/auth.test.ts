// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { verifyCronAuth } from "./auth";

function req(auth: string | null): NextRequest {
  return { headers: { get: () => auth } } as unknown as NextRequest;
}

beforeEach(() => {
  delete process.env.CRON_SECRET;
});

describe("verifyCronAuth", () => {
  it("returns 401 when CRON_SECRET is unset, even against the literal 'Bearer undefined' header", () => {
    const res = verifyCronAuth(req("Bearer undefined"));
    expect(res?.status).toBe(401);
  });

  it("returns 401 without an authorization header", () => {
    process.env.CRON_SECRET = "secret";
    const res = verifyCronAuth(req(null));
    expect(res?.status).toBe(401);
  });

  it("returns 401 with the wrong secret", () => {
    process.env.CRON_SECRET = "secret";
    const res = verifyCronAuth(req("Bearer wrong"));
    expect(res?.status).toBe(401);
  });

  it("returns null with the correct secret", () => {
    process.env.CRON_SECRET = "secret";
    const res = verifyCronAuth(req("Bearer secret"));
    expect(res).toBeNull();
  });

  it("does not authorize an empty Bearer when CRON_SECRET is an empty string", () => {
    // An empty string is a real misconfiguration (set but blank), distinct from
    // unset. It must still fail closed, not authorize a caller sending "Bearer ".
    process.env.CRON_SECRET = "";
    const res = verifyCronAuth(req("Bearer "));
    expect(res?.status).toBe(401);
  });

  it("returns 401 when the secret value is right but the Bearer prefix is missing", () => {
    // Vercel sends `Authorization: Bearer <CRON_SECRET>`; the bare secret with
    // no scheme must not pass, or the exact header format is not being enforced.
    process.env.CRON_SECRET = "secret";
    const res = verifyCronAuth(req("secret"));
    expect(res?.status).toBe(401);
  });
});
