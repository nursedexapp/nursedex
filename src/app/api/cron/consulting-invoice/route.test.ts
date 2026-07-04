// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/slack/invoice", () => ({
  generateAndPostInvoice: vi.fn().mockResolvedValue({ total: 0 }),
}));

import { GET } from "./route";
import { generateAndPostInvoice } from "@/lib/slack/invoice";

function req(auth: string | null, adminSecret: string | null): NextRequest {
  return {
    headers: {
      get: (name: string) =>
        name === "authorization" ? auth : name === "x-admin-secret" ? adminSecret : null,
    },
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
  delete process.env.ADMIN_SECRET;
});

describe("GET /api/cron/consulting-invoice auth", () => {
  it("returns 401 with no secrets configured at all", async () => {
    const res = await GET(req(null, null));
    expect(res.status).toBe(401);
    expect(generateAndPostInvoice).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong admin secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await GET(req(null, "wrong"));
    expect(res.status).toBe(401);
    expect(generateAndPostInvoice).not.toHaveBeenCalled();
  });

  it("returns 401 when ADMIN_SECRET is unset, even against the literal string 'undefined'", async () => {
    const res = await GET(req(null, "undefined"));
    expect(res.status).toBe(401);
    expect(generateAndPostInvoice).not.toHaveBeenCalled();
  });

  it("proceeds with the correct cron secret", async () => {
    process.env.CRON_SECRET = "cronsecret";
    const res = await GET(req("Bearer cronsecret", null));
    expect(res.status).toBe(200);
    expect(generateAndPostInvoice).toHaveBeenCalled();
  });

  it("proceeds with the correct admin secret", async () => {
    process.env.ADMIN_SECRET = "adminsecret";
    const res = await GET(req(null, "adminsecret"));
    expect(res.status).toBe(200);
    expect(generateAndPostInvoice).toHaveBeenCalled();
  });
});
