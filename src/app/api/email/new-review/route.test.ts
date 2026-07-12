// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// This route mails a nurse that she has a new review. Unlike the other ~28
// transactional email routes it does NOT go through handleEmailRoute: it writes
// its own CRON_SECRET check, and so inherited none of that wrapper's coverage.
// Nothing asserted that an unauthenticated caller is refused, on an endpoint
// that will look up any nurse by id and mail her.

const h = vi.hoisted(() => ({
  send: vi.fn(
    async (_message: { to: string; subject: string }) =>
      ({ error: null }) as { error: { message: string } | null },
  ),
  nurse: { data: null as unknown, error: null as unknown },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: h.send };
  },
}));
vi.mock("@/lib/email/templates/NewReview", () => ({
  NewReview: (props: unknown) => ({ props }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => h.nurse }),
      }),
    }),
  }),
}));

const SECRET = "test-cron-secret";
const NURSE_ID = "11111111-1111-4111-8111-111111111111";

function req(body: unknown, authed = true): NextRequest {
  return {
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "authorization" && authed
          ? `Bearer ${SECRET}`
          : null,
    },
    json: async () => body,
  } as unknown as NextRequest;
}

const validBody = {
  nurseUserId: NURSE_ID,
  rating: 5,
  reviewerName: "Dana",
};

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  h.send.mockResolvedValue({ error: null });
  h.nurse = {
    data: { email: "nurse@example.com", first_name: "Nia" },
    error: null,
  };
  process.env.CRON_SECRET = SECRET;
});

describe("new-review email route", () => {
  it("refuses a caller with no bearer token and mails nobody", async () => {
    const res = await POST(req(validBody, false));

    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("refuses a wrong bearer token and mails nobody", async () => {
    process.env.CRON_SECRET = "a-different-secret";

    const res = await POST(req(validBody));

    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("mails the nurse when the caller is authenticated", async () => {
    const res = await POST(req(validBody));

    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0][0]).toMatchObject({
      to: "nurse@example.com",
      subject: "New 5-star review on NurseDex",
    });
  });

  it("rejects an invalid body with 400 and mails nobody", async () => {
    const res = await POST(req({ nurseUserId: "not-a-uuid", rating: 9 }));

    expect(res.status).toBe(400);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("returns 404 rather than mailing when the nurse is not found", async () => {
    h.nurse = { data: null, error: null };

    const res = await POST(req(validBody));

    expect(res.status).toBe(404);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("surfaces a send failure as a 500 rather than a false success", async () => {
    h.send.mockResolvedValue({ error: { message: "resend down" } });

    const res = await POST(req(validBody));

    expect(res.status).toBe(500);
  });
});
