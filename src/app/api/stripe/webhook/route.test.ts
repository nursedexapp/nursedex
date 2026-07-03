// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    event: null as unknown,
    errors: {} as Record<string, { message: string } | null>,
    reads: {} as Record<string, unknown>,
  };
  const calls: string[] = [];

  function makeBuilder(table: string, op: string) {
    const b: Record<string, unknown> = {};
    b.select = () => makeBuilder(table, "select");
    b.eq = () => b;
    b.is = () => b;
    b.upsert = () => makeBuilder(table, "upsert");
    b.update = () => makeBuilder(table, "update");
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

beforeEach(() => {
  vi.clearAllMocks();
  h.state.event = null;
  h.state.errors = {};
  h.state.reads = {};
  h.calls.length = 0;
  h.subscriptionsRetrieve.mockResolvedValue(fakeSubscription());
});

describe("stripe webhook: write-failure propagation (#412)", () => {
  it("returns 500 (not 200) when the subscriptions upsert fails on checkout.session.completed", async () => {
    h.state.event = {
      type: "checkout.session.completed",
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
