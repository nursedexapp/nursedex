// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    event: null as unknown,
    signatureError: null as string | null,
    errors: {} as Record<string, { message: string; code?: string } | null>,
    reads: {} as Record<string, unknown>,
    writes: {} as Record<string, unknown>,
    // Rows a write's terminal .select() hands back. An empty array models a
    // guarded UPDATE whose WHERE matched nothing (superseded by a newer
    // event).
    rows: {} as Record<string, unknown[] | null>,
    // What apply_subscription_event returns: true = the write applied,
    // false = an already-stored newer event superseded this one.
    rpcResults: {} as Record<string, unknown>,
  };
  const calls: string[] = [];

  function makeBuilder(table: string, op: string) {
    const b: Record<string, unknown> = {};
    // A .select() after a write keeps the write's op so its terminal await
    // resolves to that write's rows, matching PostgREST's UPDATE ... RETURNING.
    b.select = () => makeBuilder(table, op === "select" ? "select" : op);
    b.eq = () => b;
    b.is = () => b;
    b.or = (expr: unknown) => {
      state.writes[`${table}.or`] = expr;
      return b;
    };
    b.upsert = (payload: unknown) => {
      state.writes[`${table}.upsert`] = payload;
      return makeBuilder(table, "upsert");
    };
    b.insert = (payload: unknown) => {
      state.writes[`${table}.insert`] = payload;
      return makeBuilder(table, "insert");
    };
    b.update = (payload: unknown) => {
      state.writes[`${table}.update`] = payload;
      return makeBuilder(table, "update");
    };
    b.maybeSingle = () =>
      Promise.resolve({ data: state.reads[table] ?? null, error: null });
    b.single = () =>
      Promise.resolve({ data: state.reads[table] ?? null, error: null });
    b.then = (
      resolve: (v: { data: unknown; error: unknown }) => unknown,
      reject: (e: unknown) => unknown,
    ) => {
      const key = `${table}.${op}`;
      calls.push(key);
      return Promise.resolve({
        data: key in state.rows ? state.rows[key] : null,
        error: state.errors[key] ?? null,
      }).then(resolve, reject);
    };
    return b;
  }

  return {
    state,
    calls,
    from: (table: string) => makeBuilder(table, "select"),
    rpc: (fn: string, params: unknown) => {
      calls.push(`rpc.${fn}`);
      state.writes[`rpc.${fn}`] = params;
      return Promise.resolve({
        data: fn in state.rpcResults ? state.rpcResults[fn] : true,
        error: state.errors[`rpc.${fn}`] ?? null,
      });
    },
    subscriptionsRetrieve: vi.fn(),
    subscriptionsCancel: vi.fn(async () => {}),
    captureException: vi.fn(),
    slackPost: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: h.from, rpc: h.rpc }),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: () => {
        if (h.state.signatureError) throw new Error(h.state.signatureError);
        return h.state.event;
      },
    },
    subscriptions: {
      retrieve: h.subscriptionsRetrieve,
      cancel: h.subscriptionsCancel,
    },
  }),
}));
vi.mock("@/lib/analytics/server", () => ({
  captureServerEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/cron/email-log", () => ({
  shouldSendOnce: vi.fn(async () => false),
}));
vi.mock("@/lib/email/send", () => ({
  sendSubscriptionConfirmedEmail: vi.fn(async () => {}),
  sendRenewalSuccessEmail: vi.fn(async () => {}),
  sendCancellationConfirmationEmail: vi.fn(async () => {}),
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: h.captureException,
}));
vi.mock("@/lib/slack/client", () => ({
  slackPost: h.slackPost,
  ALERTS_CHANNEL_ID: "C_TEST_ALERTS",
}));

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

import { POST } from "./route";
import { shouldSendOnce } from "@/lib/cron/email-log";
import {
  sendSubscriptionConfirmedEmail,
  sendRenewalSuccessEmail,
  sendCancellationConfirmationEmail,
} from "@/lib/email/send";

function fakeRequest(signature: string | null = "sig_test"): Parameters<typeof POST>[0] {
  return {
    headers: { get: () => signature },
    text: async () => "{}",
  } as unknown as Parameters<typeof POST>[0];
}

function fakeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    customer: "cus_1",
    metadata: {},
    items: {
      data: [
        {
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          price: { unit_amount: 999, recurring: { interval: "month" } },
        },
      ],
    },
    ...overrides,
  };
}

// A default event `created` timestamp used by every fixture below unless a
// test overrides it (e.g. to exercise ordering against a stored
// last_event_at).
const EVENT_CREATED = 1700000500;

beforeEach(() => {
  vi.clearAllMocks();
  h.state.event = null;
  h.state.signatureError = null;
  h.state.errors = {};
  h.state.reads = {};
  h.state.writes = {};
  h.state.rpcResults = {};
  // Default: the guarded UPDATE matched its row, so cleanup proceeds.
  h.state.rows = { "subscriptions.update": [{ id: "sub-row" }] };
  h.calls.length = 0;
  h.subscriptionsRetrieve.mockResolvedValue(fakeSubscription());
});

describe("stripe webhook: write-failure propagation (#412)", () => {
  it("returns 500 (not 200) when the subscriptions upsert fails on checkout.session.completed", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };
    h.state.errors["rpc.apply_subscription_event"] = { message: "db unavailable" };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(500);
  });

  it("returns 200 when checkout.session.completed writes succeed", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
  });

  it("returns 500 when the nurse_profiles tier update fails during upsertSubscription", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "nurse_featured" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };
    h.state.errors["nurse_profiles.update"] = { message: "constraint violation" };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(500);
  });

  it("returns 500 when the subscriptions status update fails on customer.subscription.deleted", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: EVENT_CREATED,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
    };
    h.state.errors["subscriptions.update"] = { message: "db unavailable" };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(500);
  });

  it("returns 500 when the subscriptions status update fails on invoice.paid", async () => {
    h.state.event = {
      type: "invoice.paid",
      created: EVENT_CREATED,
      data: {
        object: {
          id: "in_1",
          billing_reason: "subscription_create",
          parent: {
            subscription_details: { subscription: "sub_1" },
          },
        },
      },
    };
    h.state.errors["subscriptions.update"] = { message: "db unavailable" };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(500);
  });

  it("returns 500 when the subscriptions status update fails on invoice.payment_failed", async () => {
    h.state.event = {
      type: "invoice.payment_failed",
      created: EVENT_CREATED,
      data: {
        object: {
          id: "in_1",
          parent: {
            subscription_details: { subscription: "sub_1" },
          },
        },
      },
    };
    h.state.errors["subscriptions.update"] = { message: "db unavailable" };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(500);
  });
});

describe("stripe webhook: event ordering (#414, #528)", () => {
  // The ordering decision now lives inside apply_subscription_event's own
  // WHERE clause, so the route no longer reads last_event_at and compares it
  // in JS. Reading and then writing was a check-then-act pair: two events for
  // the same subscription delivered at the same instant could both pass the
  // "am I newer" check before either wrote (#528). These tests pin the route
  // half of that contract; migration 055's guard is pinned in
  // subscription-ordering-sql.test.ts.
  it("hands the event's created timestamp to the database as p_last_event_at", async () => {
    h.state.event = {
      type: "customer.subscription.updated",
      created: 1700001000,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      cancel_at_period_end: false,
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).toContain("rpc.apply_subscription_event");
    expect(h.state.writes["rpc.apply_subscription_event"]).toMatchObject({
      p_stripe_subscription_id: "sub_1",
      p_last_event_at: new Date(1700001000 * 1000).toISOString(),
    });
  });

  it("never compares last_event_at in JavaScript before writing", async () => {
    h.state.event = {
      type: "customer.subscription.updated",
      created: 1700000000, // older than anything the DB may hold
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      cancel_at_period_end: false,
      last_event_at: new Date(1700000900 * 1000).toISOString(),
    };

    const res = await POST(fakeRequest());

    // The route always delegates: a stale event still reaches the RPC, which
    // is what refuses it. Short-circuiting here would restore the race.
    expect(res.status).toBe(200);
    expect(h.calls).toContain("rpc.apply_subscription_event");
  });

  it("skips the nurse tier sync when the database reports the event was superseded", async () => {
    h.state.rpcResults["apply_subscription_event"] = false;
    h.state.event = {
      type: "customer.subscription.updated",
      created: 1700000000,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "nurse_featured",
      cancel_at_period_end: false,
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    // A superseded write must not drag stale tier state along with it.
    expect(h.calls).not.toContain("nurse_profiles.update");
  });

  it("runs the nurse tier sync when the database applies the event", async () => {
    h.state.rpcResults["apply_subscription_event"] = true;
    h.state.event = {
      type: "customer.subscription.updated",
      created: 1700001000,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "nurse_featured",
      cancel_at_period_end: false,
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).toContain("nurse_profiles.update");
  });

  it("puts the ordering guard in the delete UPDATE's own filter", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: 1700000000, // older than the stored last_event_at
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      last_event_at: new Date(1700000900 * 1000).toISOString(),
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    // The database, not a prior read, decides whether this stale delete wins.
    const incoming = new Date(1700000000 * 1000).toISOString();
    expect(h.state.writes["subscriptions.or"]).toBe(
      `last_event_at.is.null,last_event_at.lte.${incoming}`,
    );
  });

  it("fires no cascading writes when a concurrent newer event supersedes the delete", async () => {
    // The stale read says this delete is current, but by the time the write
    // lands a newer event has moved last_event_at forward, so the guarded
    // UPDATE matches zero rows. Cleanup must not run off a write that lost.
    h.state.rows["subscriptions.update"] = [];
    h.state.event = {
      type: "customer.subscription.deleted",
      created: 1700001000,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "nurse_featured",
      last_event_at: new Date(1700000900 * 1000).toISOString(),
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).toContain("subscriptions.update");
    expect(h.calls).not.toContain("nurse_profiles.update");
  });

  it("guards the delete UPDATE on last_event_at rather than trusting the prior read", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: 1700001000,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      last_event_at: new Date(1700000900 * 1000).toISOString(),
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.state.writes["subscriptions.update"]).toMatchObject({
      status: "cancelled",
      last_event_at: new Date(1700001000 * 1000).toISOString(),
    });
  });

  // #663. subscription.deleted got the ordering guard in #528 and these two never
  // did: they wrote the subscription's status by id alone. Stripe retries a
  // webhook for up to three days and does not promise delivery order, so a
  // payment_failed that Stripe retried could land AFTER the customer's successful
  // renewal and flip a paying subscriber back to past_due. The payment-failure
  // cron reads that status and downgrades their tier off it.
  it("puts the ordering guard in the invoice.paid UPDATE's own filter", async () => {
    h.subscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }],
      },
    });
    h.state.event = {
      type: "invoice.paid",
      created: 1700001000,
      data: {
        object: {
          id: "in_1",
          billing_reason: "subscription_create",
          parent: { subscription_details: { subscription: "sub_1" } },
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    const incoming = new Date(1700001000 * 1000).toISOString();
    expect(h.state.writes["subscriptions.or"]).toBe(
      `last_event_at.is.null,last_event_at.lte.${incoming}`,
    );
    expect(h.state.writes["subscriptions.update"]).toMatchObject({
      status: "active",
      last_event_at: incoming,
    });
  });

  it("puts the ordering guard in the invoice.payment_failed UPDATE's own filter", async () => {
    h.state.event = {
      type: "invoice.payment_failed",
      created: 1700001000,
      data: {
        object: {
          id: "in_1",
          parent: { subscription_details: { subscription: "sub_1" } },
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    const incoming = new Date(1700001000 * 1000).toISOString();
    // Without this, a retried payment_failed overwrites a newer 'active'.
    expect(h.state.writes["subscriptions.or"]).toBe(
      `last_event_at.is.null,last_event_at.lte.${incoming}`,
    );
    expect(h.state.writes["subscriptions.update"]).toMatchObject({
      status: "past_due",
      last_event_at: incoming,
    });
  });

  it("sends no renewal email when a newer event supersedes the invoice.paid write", async () => {
    // The guarded UPDATE matched zero rows, so this event lost. Its renewal email
    // describes a state that is no longer true and must not go out.
    h.subscriptionsRetrieve.mockResolvedValue({
      items: {
        data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }],
      },
    });
    h.state.rows["subscriptions.update"] = [];
    h.state.event = {
      type: "invoice.paid",
      created: 1700001000,
      data: {
        object: {
          id: "in_1",
          billing_reason: "subscription_cycle",
          parent: { subscription_details: { subscription: "sub_1" } },
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).toContain("subscriptions.update");
    // The renewal path re-reads the row to find the recipient. It must not run.
    expect(h.calls).not.toContain("subscriptions.select");
  });
});

describe("stripe webhook: subscription.deleted metadata fallback (#428)", () => {
  it("still runs tier-downgrade cleanup from event metadata when no subscriptions row exists yet", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: EVENT_CREATED,
      data: {
        object: fakeSubscription({
          metadata: { user_id: "user_1", plan_type: "nurse_featured" },
        }),
      },
    };
    h.state.reads["subscriptions"] = null;

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).toContain("nurse_profiles.update");
  });

  it("does nothing (no error) when there is no row and no usable metadata", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: EVENT_CREATED,
      data: { object: fakeSubscription({ metadata: {} }) },
    };
    h.state.reads["subscriptions"] = null;

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).not.toContain("subscriptions.update");
  });
});

describe("stripe webhook: invoice.paid refreshes period dates (#423)", () => {
  it("writes the retrieved subscription's current period dates alongside status", async () => {
    h.subscriptionsRetrieve.mockResolvedValue(
      fakeSubscription({
        items: {
          data: [
            {
              current_period_start: 1800000000,
              current_period_end: 1802592000,
              price: { unit_amount: 999, recurring: { interval: "month" } },
            },
          ],
        },
      }),
    );
    h.state.event = {
      type: "invoice.paid",
      created: EVENT_CREATED,
      data: {
        object: {
          id: "in_1",
          billing_reason: "subscription_create",
          parent: {
            subscription_details: { subscription: "sub_1" },
          },
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.state.writes["subscriptions.update"]).toMatchObject({
      status: "active",
      current_period_start: new Date(1800000000 * 1000).toISOString(),
      current_period_end: new Date(1802592000 * 1000).toISOString(),
    });
  });
});

describe("stripe webhook: duplicate active subscription handling (#417)", () => {
  it("cancels the newly-created Stripe subscription when the DB rejects a second active row for the same plan", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_2", // a second, distinct subscription id
        },
      },
    };
    h.subscriptionsRetrieve.mockResolvedValue(fakeSubscription({ id: "sub_2" }));
    h.state.errors["rpc.apply_subscription_event"] = {
      message:
        'duplicate key value violates unique constraint "uniq_subscriptions_active_per_plan"',
      code: "23505",
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.subscriptionsCancel).toHaveBeenCalledWith("sub_2");
  });

  it("does not run the nurse tier sync when the duplicate is cancelled", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "nurse_featured" },
          customer: "cus_1",
          subscription: "sub_2",
        },
      },
    };
    h.subscriptionsRetrieve.mockResolvedValue(fakeSubscription({ id: "sub_2" }));
    h.state.errors["rpc.apply_subscription_event"] = {
      message: "duplicate key value violates unique constraint",
      code: "23505",
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).not.toContain("nurse_profiles.update");
  });

  it("still fails loudly (500) on an unrelated upsert error, not the duplicate-handling path", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };
    h.state.errors["rpc.apply_subscription_event"] = { message: "db unavailable" };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(500);
    expect(h.subscriptionsCancel).not.toHaveBeenCalled();
  });
});

describe("stripe webhook: failure alerting (#396)", () => {
  it("captures the exception to Sentry with the event type and id", async () => {
    h.state.event = {
      id: "evt_123",
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };
    h.state.errors["rpc.apply_subscription_event"] = { message: "db unavailable" };

    await POST(fakeRequest());

    expect(h.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({
          action: "stripe-webhook",
          event_type: "checkout.session.completed",
        }),
        extra: expect.objectContaining({ event_id: "evt_123" }),
      }),
    );
  });

  it("posts a Slack ops alert naming the event type and id", async () => {
    h.state.event = {
      id: "evt_456",
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };
    h.state.errors["rpc.apply_subscription_event"] = { message: "db unavailable" };

    await POST(fakeRequest());

    expect(h.slackPost).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({
        channel: "C_TEST_ALERTS",
        text: expect.stringContaining("checkout.session.completed"),
      }),
    );
    expect(h.slackPost).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({ text: expect.stringContaining("evt_456") }),
    );
  });

  it("still returns 500 (so Stripe retries) even if the Slack alert itself fails", async () => {
    h.slackPost.mockRejectedValueOnce(new Error("slack down"));
    h.state.event = {
      id: "evt_789",
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };
    h.state.errors["rpc.apply_subscription_event"] = { message: "db unavailable" };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(500);
  });

  it("does not alert Sentry or Slack on a successful webhook", async () => {
    h.state.event = {
      id: "evt_ok",
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.captureException).not.toHaveBeenCalled();
    expect(h.slackPost).not.toHaveBeenCalled();
  });

  it("does not repost to Slack when the same event id already alerted (Stripe retry)", async () => {
    h.state.event = {
      id: "evt_retry",
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };
    h.state.errors["rpc.apply_subscription_event"] = { message: "db unavailable" };
    h.state.reads["webhook_alert_log"] = { event_id: "evt_retry" };

    await POST(fakeRequest());

    expect(h.slackPost).not.toHaveBeenCalled();
  });

  it("still captures to Sentry even when the alert was already sent for this event", async () => {
    h.state.event = {
      id: "evt_retry2",
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };
    h.state.errors["rpc.apply_subscription_event"] = { message: "db unavailable" };
    h.state.reads["webhook_alert_log"] = { event_id: "evt_retry2" };

    await POST(fakeRequest());

    expect(h.captureException).toHaveBeenCalled();
  });
});

describe("stripe webhook: request-level verification (#473)", () => {
  it("returns 400 when the stripe-signature header is missing", async () => {
    const res = await POST(fakeRequest(null));

    expect(res.status).toBe(400);
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    const original = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      const res = await POST(fakeRequest());
      expect(res.status).toBe(500);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = original;
    }
  });

  it("returns 400 when Stripe signature verification fails", async () => {
    h.state.signatureError = "No signatures found matching the expected signature";

    const res = await POST(fakeRequest());

    expect(res.status).toBe(400);
  });
});

describe("stripe webhook: unhandled event types (#473)", () => {
  it("acks with 200 and performs no writes for an event type we don't handle", async () => {
    h.state.event = {
      id: "evt_unhandled",
      type: "customer.subscription.trial_will_end",
      created: EVENT_CREATED,
      data: { object: {} },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).toHaveLength(0);
    expect(h.captureException).not.toHaveBeenCalled();
  });
});

describe("stripe webhook: checkout.session.completed missing fields (#473)", () => {
  it("returns early without an upsert when client_reference_id is missing", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: null,
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).not.toContain("rpc.apply_subscription_event");
    expect(h.subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("returns early without an upsert when metadata.plan_type is missing", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: {},
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).not.toContain("rpc.apply_subscription_event");
    expect(h.subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("returns early without an upsert when customer is missing", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: null,
          subscription: "sub_1",
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).not.toContain("rpc.apply_subscription_event");
  });

  it("returns early without an upsert when subscription is missing", async () => {
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: null,
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).not.toContain("rpc.apply_subscription_event");
  });
});

describe("stripe webhook: subscription.deleted grants and revocations (#473)", () => {
  it("drops a featured nurse's tier to free", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: EVENT_CREATED,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "nurse_featured",
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.state.writes["nurse_profiles.update"]).toMatchObject({
      tier: "free",
    });
  });

  it("sets a 60-day access_expires_at grace window on a family account's reveals", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: EVENT_CREATED,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
    };

    const before = Date.now();
    const res = await POST(fakeRequest());
    const after = Date.now();

    expect(res.status).toBe(200);
    const write = h.state.writes["reveals.update"] as {
      access_expires_at: string;
    };
    expect(write).toBeDefined();
    const expiresMs = new Date(write.access_expires_at).getTime();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
    // Allow a few seconds of slack for test execution time around `new Date()`.
    expect(expiresMs).toBeGreaterThanOrEqual(before + sixtyDaysMs - 5000);
    expect(expiresMs).toBeLessThanOrEqual(after + sixtyDaysMs + 5000);
  });

  it("does not touch nurse_profiles for a family_access cancellation", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: EVENT_CREATED,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
    };

    await POST(fakeRequest());

    expect(h.calls).not.toContain("nurse_profiles.update");
  });

  it("does not touch reveals for a nurse_featured cancellation", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: EVENT_CREATED,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "nurse_featured",
    };

    await POST(fakeRequest());

    expect(h.calls).not.toContain("reveals.update");
  });
});

describe("stripe webhook: invoice.payment_failed marks past_due (#473)", () => {
  it("writes status past_due on the subscription", async () => {
    h.state.event = {
      type: "invoice.payment_failed",
      created: EVENT_CREATED,
      data: {
        object: {
          id: "in_1",
          parent: {
            subscription_details: { subscription: "sub_1" },
          },
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.state.writes["subscriptions.update"]).toMatchObject({
      status: "past_due",
    });
  });
});

describe("stripe webhook: lifecycle email dedup gating (#473)", () => {
  it("sends the subscription-confirmed email only when shouldSendOnce allows it", async () => {
    vi.mocked(shouldSendOnce).mockResolvedValueOnce(true);
    h.state.reads["users"] = { email: "family@example.com", first_name: "Robin" };
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(sendSubscriptionConfirmedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "family@example.com", planType: "family_access" }),
    );
  });

  it("does not send the subscription-confirmed email when shouldSendOnce denies it (retry dedup)", async () => {
    vi.mocked(shouldSendOnce).mockResolvedValueOnce(false);
    h.state.reads["users"] = { email: "family@example.com", first_name: "Robin" };
    h.state.event = {
      type: "checkout.session.completed",
      created: EVENT_CREATED,
      data: {
        object: {
          client_reference_id: "user_1",
          metadata: { plan_type: "family_access" },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };

    await POST(fakeRequest());

    expect(sendSubscriptionConfirmedEmail).not.toHaveBeenCalled();
  });

  it("sends the renewal-success email only on subscription_cycle invoices when shouldSendOnce allows it", async () => {
    vi.mocked(shouldSendOnce).mockResolvedValueOnce(true);
    h.state.reads["users"] = { email: "renew@example.com", first_name: "Sam" };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "nurse_featured",
    };
    h.state.event = {
      type: "invoice.paid",
      created: EVENT_CREATED,
      data: {
        object: {
          id: "in_2",
          billing_reason: "subscription_cycle",
          parent: {
            subscription_details: { subscription: "sub_1" },
          },
        },
      },
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(sendRenewalSuccessEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "renew@example.com" }),
    );
  });

  it("does not send the renewal-success email on the initial subscription_create invoice", async () => {
    h.state.event = {
      type: "invoice.paid",
      created: EVENT_CREATED,
      data: {
        object: {
          id: "in_1",
          billing_reason: "subscription_create",
          parent: {
            subscription_details: { subscription: "sub_1" },
          },
        },
      },
    };

    await POST(fakeRequest());

    expect(sendRenewalSuccessEmail).not.toHaveBeenCalled();
  });

  it("sends the cancellation-confirmation email when a subscription transitions to cancel_at_period_end", async () => {
    vi.mocked(shouldSendOnce).mockResolvedValueOnce(true);
    h.state.reads["users"] = { email: "cancel@example.com", first_name: "Jamie" };
    h.state.event = {
      type: "customer.subscription.updated",
      created: EVENT_CREATED,
      data: { object: fakeSubscription({ cancel_at_period_end: true }) },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      cancel_at_period_end: false,
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(sendCancellationConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "cancel@example.com", isFamily: true }),
    );
  });
});

// Stripe delivers webhooks at least once, so the same event arriving twice is
// normal, not an attack. shouldSendOnce is the email idempotency gate: it
// returns true on the first delivery of a dedup key and false thereafter, so a
// retry must not re-send. Each case below dispatches the identical event twice
// and asserts exactly one email and a 200 on both (so Stripe stops retrying).
describe("stripe webhook: duplicate delivery is idempotent (#491)", () => {
  const checkoutEvent = {
    type: "checkout.session.completed",
    created: EVENT_CREATED,
    data: {
      object: {
        client_reference_id: "user_1",
        metadata: { plan_type: "family_access" },
        customer: "cus_1",
        subscription: "sub_1",
      },
    },
  };

  it("sends the confirmation email once across a duplicate checkout.session.completed", async () => {
    // First delivery proceeds; the retry gets shouldSendOnce=false (default).
    vi.mocked(shouldSendOnce).mockResolvedValueOnce(true);
    h.state.reads["users"] = { email: "family@example.com", first_name: "Robin" };
    h.state.event = checkoutEvent;

    const first = await POST(fakeRequest());
    const second = await POST(fakeRequest());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sendSubscriptionConfirmedEmail).toHaveBeenCalledTimes(1);
  });

  it("keeps delegating the write to the idempotent RPC on the retry, never duplicating a row itself", async () => {
    // The route never inserts a subscription row directly; it hands every
    // delivery to apply_subscription_event, whose upsert on the unique
    // stripe_subscription_id is what collapses the duplicate. The route's job
    // is only to keep delegating rather than short-circuiting the second call.
    h.state.event = checkoutEvent;

    await POST(fakeRequest());
    await POST(fakeRequest());

    const rpcCalls = h.calls.filter((c) => c === "rpc.apply_subscription_event");
    expect(rpcCalls).toHaveLength(2);
    expect(h.calls).not.toContain("subscriptions.upsert");
    expect(h.calls).not.toContain("subscriptions.insert");
  });

  it("sends the renewal email once across a duplicate invoice.paid renewal", async () => {
    vi.mocked(shouldSendOnce).mockResolvedValueOnce(true);
    h.state.reads["users"] = { email: "renew@example.com", first_name: "Sam" };
    h.state.reads["subscriptions"] = { user_id: "user_1", plan_type: "nurse_featured" };
    h.state.event = {
      type: "invoice.paid",
      created: EVENT_CREATED,
      data: {
        object: {
          id: "in_2",
          billing_reason: "subscription_cycle",
          parent: { subscription_details: { subscription: "sub_1" } },
        },
      },
    };

    const first = await POST(fakeRequest());
    const second = await POST(fakeRequest());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sendRenewalSuccessEmail).toHaveBeenCalledTimes(1);
  });

  it("sends the cancellation email once across a duplicate subscription.updated cancellation", async () => {
    vi.mocked(shouldSendOnce).mockResolvedValueOnce(true);
    h.state.reads["users"] = { email: "cancel@example.com", first_name: "Jamie" };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      cancel_at_period_end: false,
    };
    h.state.event = {
      type: "customer.subscription.updated",
      created: EVENT_CREATED,
      data: { object: fakeSubscription({ cancel_at_period_end: true }) },
    };

    const first = await POST(fakeRequest());
    const second = await POST(fakeRequest());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sendCancellationConfirmationEmail).toHaveBeenCalledTimes(1);
  });
});
