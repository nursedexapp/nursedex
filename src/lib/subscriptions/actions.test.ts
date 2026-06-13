// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const state = { customerId: "cus_123" as string | null };
  const calls = { portal: [] as Array<{ customer: string; return_url: string }> };
  function builder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.maybeSingle = () =>
      Promise.resolve({
        data: state.customerId
          ? { stripe_customer_id: state.customerId }
          : null,
      });
    return b;
  }
  return { state, calls, builder, captureException: vi.fn() };
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
// siteOrigin reads x-forwarded-proto + host; anything but "host" returns the
// proto, giving a deterministic https://nursedex.com origin.
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => (key === "host" ? "nursedex.com" : "https"),
  }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    billingPortal: {
      sessions: {
        create: async (args: { customer: string; return_url: string }) => {
          h.calls.portal.push(args);
          return { url: "https://billing.stripe.test/session" };
        },
      },
    },
    checkout: { sessions: { create: async () => ({ url: "x" }) } },
  }),
}));
vi.mock("@/lib/stripe/config", () => ({
  STRIPE_PLANS: {},
  familyAccessPriceId: () => "price_x",
  STRIPE_FAMILY_ACCESS_ANNUAL_COUPON_ID: "",
}));
vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: async () => ({ id: "u1", email: "u@x.com" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => h.builder() }),
}));
vi.mock("./queries", () => ({ getActiveSubscription: async () => null }));

import { getCustomerPortalUrl } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.customerId = "cus_123";
  h.calls.portal = [];
});

describe("getCustomerPortalUrl", () => {
  it("defaults the portal return_url to /dashboard", async () => {
    const res = await getCustomerPortalUrl();
    expect(res.url).toBe("https://billing.stripe.test/session");
    expect(h.calls.portal).toHaveLength(1);
    expect(h.calls.portal[0]).toMatchObject({
      customer: "cus_123",
      return_url: "https://nursedex.com/dashboard",
    });
  });

  it("returns the caller to the given path when returnTo is passed", async () => {
    const res = await getCustomerPortalUrl("/dashboard/settings");
    expect(res.url).toBe("https://billing.stripe.test/session");
    expect(h.calls.portal[0].return_url).toBe(
      "https://nursedex.com/dashboard/settings",
    );
  });

  it("errors without opening a portal when there is no Stripe customer", async () => {
    h.state.customerId = null;
    const res = await getCustomerPortalUrl("/dashboard/settings");
    expect(res.error).toBe("No Stripe customer record found.");
    expect(res.url).toBeUndefined();
    expect(h.calls.portal).toHaveLength(0);
  });
});
