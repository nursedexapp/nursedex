// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ unsubscribeNewsletter: vi.fn(async () => {}) }));

vi.mock("@/lib/newsletter/actions", () => ({
  unsubscribeNewsletter: h.unsubscribeNewsletter,
}));

import { POST, GET } from "./route";

const url = (token?: string) =>
  `https://nursedex.com/api/newsletter/unsubscribe${
    token === undefined ? "" : `?token=${token}`
  }`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/newsletter/unsubscribe (RFC 8058 one-click)", () => {
  it("reads the token param, delegates to the action, and returns 200", async () => {
    const res = await POST(new NextRequest(url("abc123")));
    expect(res.status).toBe(200);
    expect(h.unsubscribeNewsletter).toHaveBeenCalledWith("abc123");
  });

  it("still returns 200 with an empty token so mail clients get their 2xx", async () => {
    // A missing/invalid token must not error: a non-2xx would break the
    // one-click unsubscribe contract and hurt deliverability.
    const res = await POST(new NextRequest(url()));
    expect(res.status).toBe(200);
    expect(h.unsubscribeNewsletter).toHaveBeenCalledWith("");
  });
});

describe("GET /api/newsletter/unsubscribe", () => {
  it("redirects a human to the friendly page carrying the token", async () => {
    const res = GET(new NextRequest(url("abc123")));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(
      "/newsletter/unsubscribe?token=abc123",
    );
    // The GET link is browser-facing only; it must not run the unsubscribe.
    expect(h.unsubscribeNewsletter).not.toHaveBeenCalled();
  });

  it("url-encodes a token with special characters in the redirect", async () => {
    const res = GET(new NextRequest(url("a%20b%2Fc")));
    expect(res.headers.get("location")).toContain("token=a%20b%2Fc");
  });
});
