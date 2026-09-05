// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const state = {
    row: null as unknown, // maybeSingle result
    count: 0 as number | null, // rate-limit count
    // #847. The rate limit read `count !== null`, so a failed count read as
    // under the limit; the reads behind the token links answered "invalid";
    // and the unsubscribe writes reported success on a write that never landed.
    readError: null as { message: string } | null,
    upsertError: null as unknown,
    updateError: null as unknown,
    // Rows the guarded UPDATE matches (#663). One row = this caller won and may
    // send its email; zero rows = a concurrent caller already did the transition
    // and already sent it.
    updateRows: [{ id: "s1" }] as unknown[],
  };
  const calls = { upsert: [] as unknown[], update: [] as unknown[] };
  return {
    state,
    calls,
    // The senders report whether the email actually went out (#977), so the
    // stub has to answer as one: a bare vi.fn() answers undefined, which reads
    // as "it did not go" and would make every happy path here a failure.
    sendConfirm: vi.fn(async () => true),
    sendWelcome: vi.fn(async () => true),
    sendBatch: vi.fn(),
    getConfirmed: vi.fn(),
  };
});

function builder() {
  return createQueryBuilder({
    maybeSingle: () =>
      h.state.readError
        ? { data: null, error: h.state.readError }
        : { data: h.state.row, error: null },
    upsert: (payload) => {
      h.calls.upsert.push(payload);
      return { error: h.state.upsertError };
    },
    update: (payload) => {
      h.calls.update.push(payload);
      return "chain";
    },
    // Awaited directly by the count query and by the guarded updates; each
    // destructures the field it needs. `data` is what the updates' terminal
    // .select("id") hands back, which is how a caller learns it lost the race.
    then: () =>
      h.state.readError
        ? { count: null, data: null, error: h.state.readError }
        : {
            count: h.state.count,
            data: h.state.updateRows,
            error: h.state.updateError,
          },
  });
}

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "1.2.3.4" }),
}));
// Happy path only: this stubs the guard so the send logic past it can be
// exercised. The refused direction (a family caller mails nobody) is covered
// for real in src/lib/admin/authz-boundary.test.ts, which runs the guard.
vi.mock("@/lib/auth/helpers", () => ({
  // eslint-disable-next-line local/no-mocked-auth-guard -- see above
  requireAdmin: async () => ({ id: "a" }),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => builder() }),
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
  h.state.readError = null;
  h.state.upsertError = null;
  h.state.updateError = null;
  h.state.updateRows = [{ id: "s1" }];
  h.calls.upsert = [];
  h.calls.update = [];
  h.sendBatch.mockResolvedValue(true);
  h.sendConfirm.mockResolvedValue(true);
  h.sendWelcome.mockResolvedValue(true);
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

  it("sends no second token when a concurrent submit already re-subscribed them", async () => {
    // #663. Both callers read unsubscribed_at as set, both wrote a DIFFERENT
    // token, and both mailed one. The first token was dead on arrival, so the
    // subscriber could click a confirm link that no longer worked.
    h.state.row = {
      id: "s1",
      confirmed_at: null,
      unsubscribed_at: "2026-02-01T00:00:00Z",
    };
    h.state.updateRows = [];

    const res = await subscribeNewsletter({ email: "a@b.com" });

    expect(res.success).toBe(true);
    expect(h.sendConfirm).not.toHaveBeenCalled();
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
    expect((h.calls.upsert[0] as { ip_hash: string }).ip_hash).toMatch(
      /^[0-9a-f]{64}$/,
    );
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

  it("sends no second welcome when a concurrent fetch of the link confirmed it first", async () => {
    // #663, and the likeliest of the lot to fire in the wild: mail clients
    // prefetch links, so the same confirmation URL is routinely fetched twice
    // within milliseconds. Both callers read confirmed_at as null, both wrote,
    // and the subscriber got two welcome emails.
    h.state.row = { id: "s1", email: "a@b.com", confirmed_at: null };
    h.state.updateRows = [];

    expect(await confirmNewsletter("tok")).toBe("already");
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
    const res = await sendNewsletterIssue({
      subject: "Hi",
      body: "Hello there",
    });
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

// #847 / #990. Every one of these answered a failed database call with a claim,
// and two of them were gates that failed OPEN.
describe("when the database cannot be read or written", () => {
  it("does not let the subscription rate limit open", async () => {
    // The `count !== null` test read a missing count as under the limit, which
    // is the one gate stopping this endpoint being used to blast confirmation
    // emails at many addresses. A gate that opens when it cannot be read is
    // not a gate.
    h.state.readError = { message: "connection reset" };

    const res = await subscribeNewsletter({ email: "reader@example.com" });

    expect(res).toEqual({ success: false, error: "unknown" });
    expect(h.sendConfirm).not.toHaveBeenCalled();
    expect(h.calls.upsert).toHaveLength(0);
  });

  it("still subscribes when the rate limit genuinely reads under the cap", async () => {
    // The positive control for the refusal above.
    h.state.count = 0;

    const res = await subscribeNewsletter({ email: "reader@example.com" });

    expect(res.success).toBe(true);
  });

  it("does not tell somebody their confirmation link is invalid", async () => {
    // "invalid" is a claim about the token in their email, and it is the only
    // thing they have.
    h.state.readError = { message: "connection reset" };

    await expect(confirmNewsletter("tok")).resolves.toBe("unavailable");
  });

  it("does not tell somebody their unsubscribe link is invalid", async () => {
    h.state.readError = { message: "connection reset" };

    await expect(unsubscribeNewsletter("tok")).resolves.toBe("unavailable");
  });

  it("still says invalid for a token that genuinely matches nothing", async () => {
    h.state.row = null;

    await expect(unsubscribeNewsletter("tok")).resolves.toBe("invalid");
  });

  it("does not tell somebody they are unsubscribed when the write failed", async () => {
    h.state.readError = { message: "connection reset" };

    const res = await unsubscribeByEmail({ email: "reader@example.com" });

    expect(res).toEqual({ success: false, error: "unknown" });
  });
});

/**
 * #977. Subscribing writes the row and then sends the confirmation email. When
 * that send fails the row exists, the token is live, and the screen says "check
 * your email" for an email that is not coming, which is the one answer the
 * person cannot act on.
 */
describe("when the confirmation email does not go out", () => {
  it("reports the failure rather than telling them to check their inbox", async () => {
    h.state.row = null;
    h.sendConfirm.mockResolvedValue(false);

    const res = await subscribeNewsletter({
      email: "reader@example.com",
      source: "blog",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("email_unsent");
  });

  it("reports it on the resubscribe path too", async () => {
    // An address that had unsubscribed takes the guarded-update branch, which
    // has its own send call, so it needs its own coverage.
    h.state.row = {
      id: "s1",
      confirmed_at: null,
      unsubscribed_at: "2026-01-01T00:00:00Z",
    };
    h.sendConfirm.mockResolvedValue(false);

    const res = await subscribeNewsletter({
      email: "reader@example.com",
      source: "blog",
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe("email_unsent");
  });

  it("still confirms when only the welcome email fails", async () => {
    // They are confirmed either way; the welcome is a courtesy, and the sender
    // reports its own failure.
    h.state.row = { id: "s1", confirmed_at: null, email: "reader@example.com" };
    h.sendWelcome.mockResolvedValue(false);

    await expect(confirmNewsletter("tok")).resolves.toBe("confirmed");
  });
});

/**
 * #422. Each batch is sent through sendNewsletterBatch, which reports whether
 * it went. The loop only counted the ones that did and said nothing about the
 * rest, so an issue that reached nobody returned success with a count of zero,
 * and the admin's toast read "Sent to 0 subscribers" in a success colour.
 *
 * A cheerful empty state over a failure is the one thing this screen must not
 * do (L10): the admin has no other way to learn that a send they just paid for
 * reached nobody, and the subscribers who missed it are invisible.
 */
describe("when a newsletter batch fails to send", () => {
  const issue = { subject: "Hello", body: "Body" };

  function subscribers(n: number) {
    h.getConfirmed.mockResolvedValue(
      Array.from({ length: n }, (_, i) => ({
        email: `r${i}@example.com`,
        unsubscribe_token: `t${i}`,
      })),
    );
  }

  it("reports how many people it could not reach", async () => {
    subscribers(150);
    // Two batches of 100 and 50: the first goes, the second does not.
    h.sendBatch.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const res = await sendNewsletterIssue(issue);

    expect(res.sent).toBe(100);
    expect(res.failed).toBe(50);
  });

  it("refuses to call it a success when nobody was reached", async () => {
    // Zero sent out of a real list is not a quiet outcome. Reporting success
    // here is what put "Sent to 0 subscribers" on screen in a success colour.
    subscribers(30);
    h.sendBatch.mockResolvedValue(false);

    const res = await sendNewsletterIssue(issue);

    expect(res.success).toBe(false);
    expect(res.error).toBe("send_failed");
    expect(res.failed).toBe(30);
  });

  it("still succeeds when every batch went", async () => {
    // The positive control: without it, a rule that failed on any send at all
    // would satisfy the two above and break every real send.
    subscribers(150);
    h.sendBatch.mockResolvedValue(true);

    const res = await sendNewsletterIssue(issue);

    expect(res.success).toBe(true);
    expect(res.sent).toBe(150);
    expect(res.failed).toBe(0);
  });

  it("reports no failures when there was nobody to send to", async () => {
    // An empty list is a real and different state from a failed send, and it
    // must not read as one.
    subscribers(0);

    const res = await sendNewsletterIssue(issue);

    expect(res.success).toBe(true);
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(0);
  });
});
