// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// The bulk mailer: one authenticated call sends to up to 100 recipients. Unlike
// the other ~28 transactional email routes it does NOT go through
// handleEmailRoute, it writes its own CRON_SECRET check, and so inherited none
// of that wrapper's coverage. Nothing asserted that an unauthenticated caller is
// refused, on the single endpoint in the codebase that mails a hundred people at
// a time from our domain.

const h = vi.hoisted(() => ({
  batchSend: vi.fn(
    async (_messages: unknown[]) =>
      ({ error: null }) as { error: { message: string } | null },
  ),
}));

vi.mock("resend", () => ({
  Resend: class {
    batch = { send: h.batchSend };
  },
}));
vi.mock("@/lib/email/templates/NewsletterIssue", () => ({
  NewsletterIssue: (props: unknown) => ({ props }),
}));

const SECRET = "test-cron-secret";

function recipient(email: string) {
  return {
    email,
    unsubscribeUrl: `https://nursedex.com/unsub?t=${email}`,
    listUnsubscribeUrl: `https://nursedex.com/unsub?t=${email}&one-click=1`,
  };
}

const validBody = {
  subject: "This month at NurseDex",
  body: "<p>Hello</p>",
  recipients: [recipient("a@example.com"), recipient("b@example.com")],
};

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

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  h.batchSend.mockResolvedValue({ error: null });
  process.env.CRON_SECRET = SECRET;
});

describe("newsletter batch route", () => {
  it("refuses a caller with no bearer token and mails nobody", async () => {
    const res = await POST(req(validBody, false));

    expect(res.status).toBe(401);
    expect(h.batchSend).not.toHaveBeenCalled();
  });

  it("refuses a wrong bearer token and mails nobody", async () => {
    process.env.CRON_SECRET = "a-different-secret";

    const res = await POST(req(validBody));

    expect(res.status).toBe(401);
    expect(h.batchSend).not.toHaveBeenCalled();
  });

  it("sends the batch when the caller is authenticated", async () => {
    const res = await POST(req(validBody));

    expect(res.status).toBe(200);
    expect(h.batchSend).toHaveBeenCalledTimes(1);
    expect(h.batchSend.mock.calls[0][0]).toHaveLength(2);
  });

  it("carries the one-click unsubscribe headers bulk senders require", async () => {
    await POST(req(validBody));

    const [first] = h.batchSend.mock.calls[0][0] as Array<{
      headers: Record<string, string>;
    }>;
    expect(first.headers["List-Unsubscribe"]).toBe(
      "<https://nursedex.com/unsub?t=a@example.com&one-click=1>",
    );
    expect(first.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("rejects an invalid body with 400 and mails nobody", async () => {
    const res = await POST(req({ subject: "", body: "", recipients: [] }));

    expect(res.status).toBe(400);
    expect(h.batchSend).not.toHaveBeenCalled();
  });

  it("refuses more than Resend's 100-recipient batch limit", async () => {
    const tooMany = {
      ...validBody,
      recipients: Array.from({ length: 101 }, (_, i) =>
        recipient(`u${i}@example.com`),
      ),
    };

    const res = await POST(req(tooMany));

    expect(res.status).toBe(400);
    expect(h.batchSend).not.toHaveBeenCalled();
  });

  it("surfaces a send failure as a 500 rather than a false success", async () => {
    h.batchSend.mockResolvedValue({ error: { message: "resend down" } });

    const res = await POST(req(validBody));

    expect(res.status).toBe(500);
  });
});
