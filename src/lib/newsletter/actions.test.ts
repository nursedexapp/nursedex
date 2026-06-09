// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    row: null as unknown, // maybeSingle result
    count: 0, // rate-limit count
    upsertError: null as unknown,
    updateError: null as unknown,
  };
  const calls = { upsert: [] as unknown[], update: [] as unknown[] };
  function builder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.is = () => b;
    b.gte = () => b;
    b.maybeSingle = () => Promise.resolve({ data: state.row });
    b.upsert = (payload: unknown) => {
      calls.upsert.push(payload);
      return Promise.resolve({ error: state.upsertError });
    };
    b.update = (payload: unknown) => {
      calls.update.push(payload);
      return b;
    };
    // Awaited directly by the count query and the confirm update; each
    // destructures the field it needs.
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ count: state.count, error: state.updateError });
    return b;
  }
  return {
    state,
    calls,
    builder,
    sendConfirm: vi.fn(),
    sendWelcome: vi.fn(),
    sendBatch: vi.fn(),
    getConfirmed: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "1.2.3.4" }),
}));
vi.mock("@/lib/auth/helpers", () => ({ requireAdmin: async () => ({ id: "a" }) }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => h.builder() }),
}));
vi.mock("./queries", () => ({ getConfirmedSubscribers: h.getConfirmed }));
vi.mock("@/lib/email/send", () => ({
  sendNewsletterConfirmEmail: h.sendConfirm,
  sendNewsletterWelcomeEmail: h.sendWelcome,
  sendNewsletterBatch: h.sendBatch,
}));

import {
  subscribeNewsletter,
  confirmNewsletter,
  sendNewsletterIssue,
  unsubscribeNewsletter,
  unsubscribeByEmail,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.row = null;
  h.state.count = 0;
  h.state.upsertError = null;
  h.state.updateError = null;
  h.calls.upsert = [];
  h.calls.update = [];
  h.sendBatch.mockResolvedValue(true);
});

describe("subscribeNewsletter", () => {
  it("stores a new subscriber with a token and sends the confirm email", async () => {
    const res = await subscribeNewsletter({
      email: " Reader@Example.com ",
      source: "blog_post",
    });
    expect(res.success).toBe(true);
    expect(h.calls.upsert).toHaveLength(1);
    expect(h.calls.upsert[0]).toMatchObject({
      email: "reader@example.com",
      source: "blog_post",
    });
    expect(
      (h.calls.upsert[0] as { confirmation_token: string }).confirmation_token,
    ).toBeTruthy();
    expect(h.sendConfirm).toHaveBeenCalledWith(
      "reader@example.com",
      expect.any(String),
    );
  });

  it("succeeds without an email for an already-confirmed address", async () => {
    h.state.row = { confirmed_at: "2026-01-01T00:00:00Z" };
    const res = await subscribeNewsletter({ email: "a@b.com" });
    expect(res.success).toBe(true);
    expect(h.calls.upsert).toHaveLength(0);
    expect(h.sendConfirm).not.toHaveBeenCalled();
  });

  it("re-confirms a previously unsubscribed address with a fresh email", async () => {
    h.state.row = {
      id: "s1",
      confirmed_at: "2026-01-01T00:00:00Z",
      unsubscribed_at: "2026-02-01T00:00:00Z",
    };
    const res = await subscribeNewsletter({ email: "a@b.com" });
    expect(res.success).toBe(true);
    // Reset to unconfirmed and cleared the unsubscribe.
    expect(h.calls.update[0]).toMatchObject({
      confirmed_at: null,
      unsubscribed_at: null,
    });
    // A fresh confirmation email is sent so re-activation needs a re-confirm.
    expect(h.sendConfirm).toHaveBeenCalledWith("a@b.com", expect.any(String));
  });

  it("silently drops a filled honeypot", async () => {
    const res = await subscribeNewsletter({ email: "a@b.com", website: "x" });
    expect(res.success).toBe(true);
    expect(h.calls.upsert).toHaveLength(0);
    expect(h.sendConfirm).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with field errors and stores nothing", async () => {
    const res = await subscribeNewsletter({ email: "nope" });
    expect(res.success).toBe(false);
    expect(res.fieldErrors?.email).toBeTruthy();
    expect(h.calls.upsert).toHaveLength(0);
  });

  it("returns unknown on an upsert failure", async () => {
    h.state.upsertError = { message: "boom" };
    const res = await subscribeNewsletter({ email: "a@b.com" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("unknown");
    expect(h.sendConfirm).not.toHaveBeenCalled();
  });

  it("rate-limits when the IP is over the hourly cap", async () => {
    h.state.count = 5;
    const res = await subscribeNewsletter({ email: "a@b.com" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("rate_limited");
    expect(h.calls.upsert).toHaveLength(0);
    expect(h.sendConfirm).not.toHaveBeenCalled();
  });

  it("stores the hashed IP with the subscription", async () => {
    await subscribeNewsletter({ email: "a@b.com" });
    expect(
      (h.calls.upsert[0] as { ip_hash: string }).ip_hash,
    ).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("confirmNewsletter", () => {
  it("confirms an unconfirmed token and sends the welcome email", async () => {
    h.state.row = { id: "s1", email: "a@b.com", confirmed_at: null };
    expect(await confirmNewsletter("tok")).toBe("confirmed");
    expect(h.calls.update[0]).toHaveProperty("confirmed_at");
    expect(h.sendWelcome).toHaveBeenCalledWith("a@b.com");
  });

  it("is idempotent for an already-confirmed token", async () => {
    h.state.row = { id: "s1", email: "a@b.com", confirmed_at: "2026-01-01" };
    expect(await confirmNewsletter("tok")).toBe("already");
    expect(h.calls.update).toHaveLength(0);
    expect(h.sendWelcome).not.toHaveBeenCalled();
  });

  it("returns invalid for an unknown or empty token", async () => {
    h.state.row = null;
    expect(await confirmNewsletter("bad")).toBe("invalid");
    expect(await confirmNewsletter("")).toBe("invalid");
    expect(h.sendWelcome).not.toHaveBeenCalled();
  });
});

describe("sendNewsletterIssue", () => {
  it("sends to every confirmed subscriber and reports the count", async () => {
    h.getConfirmed.mockResolvedValue([
      { email: "a@x.com", unsubscribe_token: "t1" },
      { email: "b@x.com", unsubscribe_token: "t2" },
    ]);
    const res = await sendNewsletterIssue({ subject: "Hi", body: "Hello there" });
    expect(res.success).toBe(true);
    expect(res.sent).toBe(2);
    expect(h.sendBatch).toHaveBeenCalledTimes(1);
    expect(h.sendBatch).toHaveBeenCalledWith("Hi", "Hello there", [
      { email: "a@x.com", unsubscribe_token: "t1" },
      { email: "b@x.com", unsubscribe_token: "t2" },
    ]);
  });

  it("succeeds with zero sent when there are no subscribers", async () => {
    h.getConfirmed.mockResolvedValue([]);
    const res = await sendNewsletterIssue({ subject: "Hi", body: "Body" });
    expect(res.success).toBe(true);
    expect(res.sent).toBe(0);
    expect(h.sendBatch).not.toHaveBeenCalled();
  });

  it("rejects a missing subject/body without sending", async () => {
    const res = await sendNewsletterIssue({ subject: "", body: "" });
    expect(res.success).toBe(false);
    expect(res.fieldErrors?.subject).toBeTruthy();
    expect(h.getConfirmed).not.toHaveBeenCalled();
  });
});

describe("unsubscribeNewsletter", () => {
  it("unsubscribes a valid token", async () => {
    h.state.row = { id: "s1", unsubscribed_at: null };
    expect(await unsubscribeNewsletter("tok")).toBe("ok");
    expect(h.calls.update[0]).toHaveProperty("unsubscribed_at");
  });

  it("is idempotent for an already-unsubscribed token", async () => {
    h.state.row = { id: "s1", unsubscribed_at: "2026-01-01" };
    expect(await unsubscribeNewsletter("tok")).toBe("ok");
    expect(h.calls.update).toHaveLength(0);
  });

  it("returns invalid for an unknown or empty token", async () => {
    h.state.row = null;
    expect(await unsubscribeNewsletter("bad")).toBe("invalid");
    expect(await unsubscribeNewsletter("")).toBe("invalid");
  });
});

describe("unsubscribeByEmail", () => {
  it("unsubscribes a valid email and reports success", async () => {
    const res = await unsubscribeByEmail({ email: "a@b.com" });
    expect(res.success).toBe(true);
    expect(h.calls.update[0]).toHaveProperty("unsubscribed_at");
  });

  it("reports success even when nothing matched (no enumeration)", async () => {
    const res = await unsubscribeByEmail({ email: "unknown@x.com" });
    expect(res.success).toBe(true);
  });

  it("rejects an invalid email without writing", async () => {
    const res = await unsubscribeByEmail({ email: "nope" });
    expect(res.success).toBe(false);
    expect(res.error).toBe("invalid");
    expect(h.calls.update).toHaveLength(0);
  });
});
