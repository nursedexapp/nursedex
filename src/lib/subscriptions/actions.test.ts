// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const state = { customerId: "cus_123" as string | null };
  const calls = {
    portal: [] as Array<{ customer: string; return_url: string }>,
    checkout: [] as Array<Record<string, unknown>>,
  };
  return { state, calls, captureException: vi.fn() };
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
    checkout: {
      sessions: {
        create: async (args: Record<string, unknown>) => {
          h.calls.checkout.push(args);
          return { url: "https://checkout.stripe.test/session" };
        },
      },
    },
  }),
}));
vi.mock("@/lib/stripe/config", () => ({
  STRIPE_PLANS: {
    nurse_featured: { priceId: "price_nurse_featured" },
    family_access: { priceId: "price_family_monthly" },
  },
  familyAccessPriceId: (interval: string) =>
    interval === "year" ? "price_family_annual" : "price_family_monthly",
  STRIPE_FAMILY_ACCESS_ANNUAL_COUPON_ID: "promo_annual_first_year",
}));
vi.mock("@/lib/auth/helpers", () => ({
  getCurrentUser: async () => ({ id: "u1", email: "u@x.com" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () =>
      createQueryBuilder({
        maybeSingle: () => ({
          data: h.state.customerId
            ? { stripe_customer_id: h.state.customerId }
            : null,
        }),
      }),
  }),
}));
vi.mock("./queries", () => ({ getActiveSubscription: async () => null }));

import {
  getCustomerPortalUrl,
  createFamilyAccessCheckout,
  createNurseFeaturedCheckout,
} from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  h.state.customerId = "cus_123";
  h.calls.portal = [];
  h.calls.checkout = [];
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

describe("createFamilyAccessCheckout", () => {
  it("creates a monthly session with the monthly price, no coupon, and the family_access metadata contract", async () => {
    const res = await createFamilyAccessCheckout({});
    expect(res.url).toBe("https://checkout.stripe.test/session");
    expect(h.calls.checkout).toHaveLength(1);
    const call = h.calls.checkout[0];
    expect(call.mode).toBe("subscription");
    expect(call.line_items).toEqual([
      { price: "price_family_monthly", quantity: 1 },
    ]);
    expect(call.client_reference_id).toBe("u1");
    expect(call.metadata).toMatchObject({
      user_id: "u1",
      plan_type: "family_access",
    });
    expect(call.discounts).toBeUndefined();
    expect(call.allow_promotion_codes).toBe(true);
  });

  it("creates an annual session with the annual price and applies the first-year coupon", async () => {
    const res = await createFamilyAccessCheckout({ interval: "year" });
    expect(res.url).toBe("https://checkout.stripe.test/session");
    const call = h.calls.checkout[0];
    expect(call.line_items).toEqual([
      { price: "price_family_annual", quantity: 1 },
    ]);
    expect(call.discounts).toEqual([{ coupon: "promo_annual_first_year" }]);
    expect(call.allow_promotion_codes).toBeUndefined();
    expect(call.metadata).toMatchObject({ plan_type: "family_access" });
  });

  it("routes the success redirect through checkout-success with the returnTo path and a subscribed=family flag", async () => {
    await createFamilyAccessCheckout({ returnTo: "/nurses/abc" });
    const call = h.calls.checkout[0];
    const successUrl = call.success_url as string;
    expect(successUrl.startsWith(
      "https://nursedex.com/api/stripe/checkout-success?next=",
    )).toBe(true);
    expect(successUrl).toContain("session_id={CHECKOUT_SESSION_ID}");
    const next = new URL(successUrl).searchParams.get("next")!;
    expect(next).toBe("/nurses/abc?subscribed=family");
  });
});

describe("createNurseFeaturedCheckout", () => {
  it("creates a session with the nurse_featured price, metadata, and client_reference_id", async () => {
    const res = await createNurseFeaturedCheckout();
    expect(res.url).toBe("https://checkout.stripe.test/session");
    const call = h.calls.checkout[0];
    expect(call.mode).toBe("subscription");
    expect(call.line_items).toEqual([
      { price: "price_nurse_featured", quantity: 1 },
    ]);
    expect(call.client_reference_id).toBe("u1");
    expect(call.metadata).toMatchObject({
      user_id: "u1",
      plan_type: "nurse_featured",
    });
    expect(call.discounts).toBeUndefined();
    expect(call.allow_promotion_codes).toBe(true);
  });
});
