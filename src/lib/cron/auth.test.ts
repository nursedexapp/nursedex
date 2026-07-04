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
});
