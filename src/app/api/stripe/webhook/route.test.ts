// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    event: null as unknown,
    errors: {} as Record<string, { message: string } | null>,
    reads: {} as Record<string, unknown>,
    writes: {} as Record<string, unknown>,
  };
  const calls: string[] = [];

  function makeBuilder(table: string, op: string) {
    const b: Record<string, unknown> = {};
    b.select = () => makeBuilder(table, "select");
    b.eq = () => b;
    b.is = () => b;
    b.upsert = (payload: unknown) => {
      state.writes[`${table}.upsert`] = payload;
      return makeBuilder(table, "upsert");
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
      resolve: (v: { error: unknown }) => unknown,
      reject: (e: unknown) => unknown,
    ) => {
      calls.push(`${table}.${op}`);
      return Promise.resolve({
        error: state.errors[`${table}.${op}`] ?? null,
      }).then(resolve, reject);
    };
    return b;
  }

  return {
    state,
    calls,
    from: (table: string) => makeBuilder(table, "select"),
    subscriptionsRetrieve: vi.fn(),
  };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: h.from }),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: () => h.state.event,
    },
    subscriptions: {
      retrieve: h.subscriptionsRetrieve,
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

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

import { POST } from "./route";

function fakeRequest(): Parameters<typeof POST>[0] {
  return {
    headers: { get: () => "sig_test" },
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
  h.state.errors = {};
  h.state.reads = {};
  h.state.writes = {};
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
    h.state.errors["subscriptions.upsert"] = { message: "db unavailable" };

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

describe("stripe webhook: event ordering (#414)", () => {
  it("ignores an out-of-order customer.subscription.updated event older than what was last applied", async () => {
    h.state.event = {
      type: "customer.subscription.updated",
      created: 1700000000, // older than the stored last_event_at below
      data: { object: fakeSubscription({ cancel_at_period_end: false }) },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      cancel_at_period_end: true,
      last_event_at: new Date(1700000900 * 1000).toISOString(),
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).not.toContain("subscriptions.upsert");
  });

  it("applies a customer.subscription.updated event newer than what was last applied", async () => {
    h.state.event = {
      type: "customer.subscription.updated",
      created: 1700001000, // newer than the stored last_event_at below
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      cancel_at_period_end: false,
      last_event_at: new Date(1700000900 * 1000).toISOString(),
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).toContain("subscriptions.upsert");
  });

  it("still applies an event whose created timestamp exactly matches what was last applied", async () => {
    // Stripe's `created` is unix seconds, not guaranteed unique across
    // distinct events for the same object; treating "equal" as stale would
    // risk silently dropping a legitimate second event from the same
    // second, not just a harmless exact-duplicate redelivery.
    h.state.event = {
      type: "customer.subscription.updated",
      created: 1700000900,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      cancel_at_period_end: false,
      last_event_at: new Date(1700000900 * 1000).toISOString(),
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).toContain("subscriptions.upsert");
  });

  it("ignores an out-of-order customer.subscription.deleted event older than what was last applied", async () => {
    h.state.event = {
      type: "customer.subscription.deleted",
      created: 1700000000,
      data: { object: fakeSubscription() },
    };
    h.state.reads["subscriptions"] = {
      user_id: "user_1",
      plan_type: "family_access",
      last_event_at: new Date(1700000900 * 1000).toISOString(),
    };

    const res = await POST(fakeRequest());

    expect(res.status).toBe(200);
    expect(h.calls).not.toContain("subscriptions.update");
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
