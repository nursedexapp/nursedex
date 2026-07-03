// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const cancel = vi.fn(async () => {});
  return { cancel };
});

vi.mock("./server", () => ({
  getStripe: () => ({ subscriptions: { cancel: h.cancel } }),
}));

import { cancelActiveStripeSubscriptions } from "./cancel-subscriptions";

function fakeSupabase(subs: Array<Record<string, unknown>>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: subs, error: null }),
      }),
    }),
  } as unknown as Parameters<typeof cancelActiveStripeSubscriptions>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cancelActiveStripeSubscriptions", () => {
  it("cancels an active subscription", async () => {
    const supabase = fakeSupabase([
      { stripe_subscription_id: "sub_1", status: "active" },
    ]);

    await cancelActiveStripeSubscriptions(supabase, "user_1");

    expect(h.cancel).toHaveBeenCalledWith("sub_1");
  });

  it("skips a subscription already stored as cancelled (app spelling, not Stripe's)", async () => {
    const supabase = fakeSupabase([
      { stripe_subscription_id: "sub_1", status: "cancelled" },
    ]);

    await cancelActiveStripeSubscriptions(supabase, "user_1");

    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("skips a subscription already stored as expired", async () => {
    const supabase = fakeSupabase([
      { stripe_subscription_id: "sub_1", status: "expired" },
    ]);

    await cancelActiveStripeSubscriptions(supabase, "user_1");

    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("skips a row with no stripe_subscription_id", async () => {
    const supabase = fakeSupabase([
      { stripe_subscription_id: null, status: "active" },
    ]);

    await cancelActiveStripeSubscriptions(supabase, "user_1");

    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("does not throw when Stripe's cancel call fails, and still processes the rest", async () => {
    h.cancel.mockRejectedValueOnce(new Error("stripe unavailable"));
    const supabase = fakeSupabase([
      { stripe_subscription_id: "sub_1", status: "active" },
      { stripe_subscription_id: "sub_2", status: "past_due" },
    ]);

    await expect(
      cancelActiveStripeSubscriptions(supabase, "user_1"),
    ).resolves.not.toThrow();
    expect(h.cancel).toHaveBeenCalledWith("sub_1");
    expect(h.cancel).toHaveBeenCalledWith("sub_2");
  });
});
