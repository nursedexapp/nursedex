// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => {
  const state = {
    role: "nurse" as "nurse" | "family",
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
      Promise.resolve({
        data: { zip_code: "11779", communication_preference: "email" },
      });
    return b;
  }
  return { state, familyBuilder };
});

vi.mock("server-only", () => ({}));
// Happy-path render only: this stubs the guard so the page's rendering can be
// exercised as a signed-in user. The refused direction is covered for real in
// src/app/page-authz-boundary.test.tsx, which runs the actual guard and asserts
// a signed-out caller is sent to /login without the page rendering.
//
// (That suite did not exist when this note was first written, and the note said
// so. It landed in #639, so the note is now updated rather than left claiming a
// gap that is closed: a stale comment that misinforms is worse than none.)
vi.mock("@/lib/auth/helpers", () => ({
  // eslint-disable-next-line local/no-mocked-auth-guard -- see note above
  requireAuth: async () => ({
    id: "u1",
    role: h.state.role,
    marketing_opt_out: false,
    zip_code: "11779",
    communication_preference: "email",
    phone: null,
    first_name: "Dana",
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => h.familyBuilder() }),
}));
vi.mock("@/lib/subscriptions/queries", () => ({
  getActiveSubscription: async (_userId: string, planType: string) => {
    h.state.lastPlanType = planType;
    return h.state.sub;
  },
}));
// Server actions are passed as props but never invoked during render.
vi.mock("@/lib/auth/actions", () => ({
  resetPassword: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/family/actions", () => ({ updateFamilyContact: vi.fn() }));
vi.mock("@/lib/subscriptions/actions", () => ({
  getCustomerPortalUrl: vi.fn(),
  redirectToCheckout: vi.fn(),
}));
vi.mock("@/lib/profile/actions", () => ({ softDeleteAccount: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import SettingsPage from "./page";

beforeEach(() => {
  h.state.role = "nurse";
  h.state.sub = null;
  h.state.lastPlanType = null;
});

describe("SettingsPage billing card", () => {
  it("renders the Featured billing card and queries the nurse plan", async () => {
    h.state.role = "nurse";
    h.state.sub = {
      current_period_end: "2026-07-13T12:00:00Z",
      cancel_at_period_end: false,
      status: "active",
    };
    const html = renderToStaticMarkup(await SettingsPage());
    expect(h.state.lastPlanType).toBe("nurse_featured");
    expect(html).toContain("Featured renews on");
    expect(html).toContain("Manage subscription");
  });

  it("renders the Family Access billing card and queries the family plan", async () => {
    h.state.role = "family";
    h.state.sub = {
      current_period_end: "2026-07-13T12:00:00Z",
      cancel_at_period_end: false,
      status: "active",
    };
    const html = renderToStaticMarkup(await SettingsPage());
    expect(h.state.lastPlanType).toBe("family_access");
    expect(html).toContain("Family Access renews on");
  });

  it("omits the billing card when there is no active subscription", async () => {
    h.state.role = "nurse";
    h.state.sub = null;
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html).not.toContain("Manage subscription");
    expect(html).not.toContain("renews on");
  });
});
