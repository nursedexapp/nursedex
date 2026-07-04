// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { GET, POST } from "./route";

function req(secretHeader: string | null): NextRequest {
  return {
    headers: { get: () => secretHeader },
  } as unknown as NextRequest;
}

beforeEach(() => {
  delete process.env.ADMIN_SECRET;
});

describe("/api/slack/track auth guard", () => {
  it("GET returns 401 when ADMIN_SECRET is unset, even against the literal string 'undefined'", async () => {
    const res = await GET(req("undefined"));
    expect(res.status).toBe(401);
  });

  it("GET returns 401 with the wrong secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await GET(req("wrong"));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when ADMIN_SECRET is unset", async () => {
    const res = await POST(req("undefined"));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 with the wrong secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await POST(req("wrong"));
    expect(res.status).toBe(401);
  });
});
