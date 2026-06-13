// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => {
  const state = {
    sub: null as
      | null
      | {
          current_period_end: string;
          cancel_at_period_end: boolean;
          status: string;
        },
    lastPlanType: null as string | null,
  };
  function familyBuilder() {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.single = () =>
      Promise.resolve({ data: { survey_completed: true } });
    return b;
  }
  return { state, familyBuilder };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/helpers", () => ({
  requireAuth: async () => ({
    id: "u1",
    role: "family",
    first_name: "Dana",
    zip_code: "11779",
    communication_preference: "email",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => h.familyBuilder() }),
}));
vi.mock("@/lib/reveals/queries", () => ({
  getRevealedNurses: async () => [],
}));
vi.mock("@/lib/nurses/search", () => ({
  searchNurses: async () => ({ items: [] }),
}));
vi.mock("@/lib/subscriptions/queries", () => ({
  getActiveSubscription: async (_userId: string, planType: string) => {
    h.state.lastPlanType = planType;
    return h.state.sub;
  },
}));
vi.mock("@/lib/subscriptions/actions", () => ({
  getCustomerPortalUrl: vi.fn(),
  redirectToCheckout: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import DashboardPage from "./page";

beforeEach(() => {
  h.state.sub = null;
  h.state.lastPlanType = null;
});

describe("Family dashboard subscription card", () => {
  it("shows the Family Access status card and queries the family plan", async () => {
    h.state.sub = {
      current_period_end: "2026-07-13T12:00:00Z",
      cancel_at_period_end: false,
      status: "active",
    };
    const html = renderToStaticMarkup(await DashboardPage());
    expect(h.state.lastPlanType).toBe("family_access");
    expect(html).toContain("Family Access renews on");
    expect(html).toContain("Manage subscription");
  });

  it("steers a past-due family sub toward updating payment", async () => {
    h.state.sub = {
      current_period_end: "2026-07-13T12:00:00Z",
      cancel_at_period_end: false,
      status: "past_due",
    };
    const html = renderToStaticMarkup(await DashboardPage());
    expect(html).toContain("Update payment to keep Family Access");
    expect(html).toContain("Payment failed");
  });

  it("omits the card when there is no active family subscription", async () => {
    h.state.sub = null;
    const html = renderToStaticMarkup(await DashboardPage());
    expect(h.state.lastPlanType).toBe("family_access");
    expect(html).not.toContain("Manage subscription");
    expect(html).not.toContain("renews on");
  });
});
