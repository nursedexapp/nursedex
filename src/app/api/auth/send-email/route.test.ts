// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

// The Supabase auth hook: this is what mails every login link, signup
// confirmation and password reset. It had no tests at all.
//
// Its signature check is the only thing between the public internet and an
// endpoint that sends mail carrying auth tokens from our domain. Nothing
// asserted that a forged request is refused, that a replayed one is refused, or
// that the confirmation link cannot be pointed at someone else's site.

const h = vi.hoisted(() => ({
  // Typed with its argument so the assertions below can read what was sent:
  // vitest does not typecheck, but CI runs tsc and an untyped mock fails there.
  send: vi.fn(
    async (_message: { to: string; subject: string }) =>
      ({ error: null }) as { error: { message: string } | null },
  ),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: h.send };
  },
}));

vi.mock("@/lib/email/templates/AuthEmail", () => ({
  AuthEmail: (props: unknown) => ({ props }),
  AUTH_EMAIL_SUBJECTS: {
    signup: "Confirm your email",
    recovery: "Reset your password",
    magiclink: "Your sign-in link",
    email_change: "Confirm your new email",
    invite: "You are invited",
    reauthentication: "Confirm it is you",
  },
}));

// Supabase hands the secret over as "v1,whsec_<base64>".
const SECRET_BYTES = Buffer.from("super-secret-webhook-key-0123456789");
const SECRET = `v1,whsec_${SECRET_BYTES.toString("base64")}`;

const WEBHOOK_ID = "msg_2abc";

function payload(over: Record<string, unknown> = {}) {
  return {
    user: { id: "u1", email: "nurse@example.com" },
    email_data: {
      token: "123456",
      token_hash: "hash_abc",
      redirect_to: "https://nursedex.com/auth/callback",
      email_action_type: "recovery",
      site_url: "https://nursedex.com",
    },
    ...over,
  };
}

/** The signature Supabase would send for this exact body at this exact time. */
function sign(body: string, timestamp: number, secret = SECRET_BYTES) {
  const mac = crypto
    .createHmac("sha256", secret)
    .update(`${WEBHOOK_ID}.${timestamp}.${body}`)
    .digest("base64");
  return `v1,${mac}`;
}

function req(
  body: string,
  headers: Record<string, string | null> = {},
): Parameters<typeof POST>[0] {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) {
    if (v !== null) map.set(k.toLowerCase(), v);
  }
  return {
    text: async () => body,
    headers: { get: (k: string) => map.get(k.toLowerCase()) ?? null },
  } as unknown as Parameters<typeof POST>[0];
}

/** A correctly signed, currently-timestamped request. */
function signedReq(body: string, atSeconds = Math.floor(Date.now() / 1000)) {
  return req(body, {
    "webhook-id": WEBHOOK_ID,
    "webhook-timestamp": String(atSeconds),
    "webhook-signature": sign(body, atSeconds),
  });
}

import { POST, buildConfirmUrl } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  h.send.mockResolvedValue({ error: null });
  process.env.SUPABASE_AUTH_WEBHOOK_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = "https://nursedex.com";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("auth email hook: only Supabase can make it send", () => {
  it("accepts a correctly signed request and sends the mail", async () => {
    const body = JSON.stringify(payload());

    const res = await POST(signedReq(body));

    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0][0]).toMatchObject({
      to: "nurse@example.com",
      subject: "Reset your password",
    });
  });

  it("refuses an unsigned request with 401 and sends nothing", async () => {
    const body = JSON.stringify(payload());

    const res = await POST(req(body));

    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("refuses a forged signature and sends nothing", async () => {
    const body = JSON.stringify(payload());
    const ts = Math.floor(Date.now() / 1000);

    const res = await POST(
      req(body, {
        "webhook-id": WEBHOOK_ID,
        "webhook-timestamp": String(ts),
        "webhook-signature": sign(body, ts, Buffer.from("the-wrong-key")),
      }),
    );

    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("refuses a request whose body was swapped after signing", async () => {
    // The attack the signature exists to stop: a real signature lifted from one
    // request, replayed with the recipient changed to an inbox they control.
    const signedBody = JSON.stringify(payload());
    const ts = Math.floor(Date.now() / 1000);
    const tamperedBody = JSON.stringify(
      payload({ user: { id: "u1", email: "attacker@evil.example" } }),
    );

    const res = await POST(
      req(tamperedBody, {
        "webhook-id": WEBHOOK_ID,
        "webhook-timestamp": String(ts),
        "webhook-signature": sign(signedBody, ts),
      }),
    );

    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("refuses a replayed request once its timestamp is stale", async () => {
    // A captured request stays perfectly signed forever. The 5 minute window is
    // the only thing that stops it being replayed later.
    const body = JSON.stringify(payload());
    const sixMinutesAgo = Math.floor(Date.now() / 1000) - 6 * 60;

    const res = await POST(signedReq(body, sixMinutesAgo));

    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("still accepts a request from inside the replay window", async () => {
    const body = JSON.stringify(payload());
    const fourMinutesAgo = Math.floor(Date.now() / 1000) - 4 * 60;

    const res = await POST(signedReq(body, fourMinutesAgo));

    expect(res.status).toBe(200);
  });

  it("refuses a non-numeric timestamp instead of trusting it", async () => {
    const body = JSON.stringify(payload());

    const res = await POST(
      req(body, {
        "webhook-id": WEBHOOK_ID,
        "webhook-timestamp": "not-a-number",
        "webhook-signature": sign(body, Math.floor(Date.now() / 1000)),
      }),
    );

    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("fails closed and sends nothing when the secret is not configured", async () => {
    delete process.env.SUPABASE_AUTH_WEBHOOK_SECRET;
    const body = JSON.stringify(payload());

    const res = await POST(signedReq(body));

    expect(res.status).toBe(500);
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each(["whsec_", ""])(
    "accepts the secret written without the 'v1,' prefix (%s form)",
    async (prefix) => {
      process.env.SUPABASE_AUTH_WEBHOOK_SECRET = `${prefix}${SECRET_BYTES.toString("base64")}`;
      const body = JSON.stringify(payload());

      const res = await POST(signedReq(body));

      expect(res.status).toBe(200);
    },
  );
});

describe("auth email hook: what it will act on", () => {
  it("refuses an action type outside the allowlist", async () => {
    const body = JSON.stringify(
      payload({
        email_data: { ...payload().email_data, email_action_type: "arbitrary" },
      }),
    );

    const res = await POST(signedReq(body));

    expect(res.status).toBe(400);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("refuses a payload with no recipient", async () => {
    const body = JSON.stringify(payload({ user: { id: "u1" } }));

    const res = await POST(signedReq(body));

    expect(res.status).toBe(400);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("returns 400 on a signed body that is not JSON", async () => {
    const res = await POST(signedReq("not json at all"));

    expect(res.status).toBe(400);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("surfaces a send failure as a 500 rather than reporting success", async () => {
    h.send.mockResolvedValue({ error: { message: "resend down" } } as never);
    const body = JSON.stringify(payload());

    const res = await POST(signedReq(body));

    expect(res.status).toBe(500);
  });
});

describe("auth email hook: the confirmation link cannot be aimed elsewhere", () => {
  // This link carries a one-time auth token. If an attacker could set where it
  // lands, they would have a phishing link on our own domain that hands the
  // token to their site: the classic open redirect, on the worst possible page.
  it("passes through a safe relative next path", () => {
    const url = buildConfirmUrl(
      payload({
        email_data: {
          ...payload().email_data,
          redirect_to: "https://nursedex.com/auth/callback?next=/dashboard",
        },
      }) as never,
    );

    expect(url).toContain("next=%2Fdashboard");
  });

  it("drops an absolute next pointing at another site", () => {
    const url = buildConfirmUrl(
      payload({
        email_data: {
          ...payload().email_data,
          redirect_to:
            "https://nursedex.com/auth/callback?next=https://evil.example/steal",
        },
      }) as never,
    );

    expect(url).not.toContain("evil.example");
    expect(url).not.toContain("next=");
  });

  it("drops a protocol-relative next, which a naive check would let through", () => {
    const url = buildConfirmUrl(
      payload({
        email_data: {
          ...payload().email_data,
          redirect_to: "https://nursedex.com/auth/callback?next=//evil.example",
        },
      }) as never,
    );

    expect(url).not.toContain("evil.example");
    expect(url).not.toContain("next=");
  });

  it("leaves next unset when redirect_to is malformed", () => {
    const url = buildConfirmUrl(
      payload({
        email_data: { ...payload().email_data, redirect_to: "))not a url((" },
      }) as never,
    );

    expect(url).not.toContain("next=");
    expect(url).toContain("token_hash=hash_abc");
  });

  it("always carries the token hash and action type", () => {
    const url = buildConfirmUrl(payload() as never);

    expect(url).toContain("https://nursedex.com/auth/callback?");
    expect(url).toContain("token_hash=hash_abc");
    expect(url).toContain("type=recovery");
  });
});
