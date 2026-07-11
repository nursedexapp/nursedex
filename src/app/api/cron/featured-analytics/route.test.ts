// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const state = {
    featured: {
      data: [] as unknown[],
      error: null as { message: string } | null,
    },
    analytics: { data: [] as unknown[] },
  };
  return {
    state,
    shouldSendOnce: vi.fn(async () => true),
    sendFeaturedAnalyticsEmail: vi.fn(async () => {}),
    client: {
      from: (table: string) =>
        createQueryBuilder({
          then: () =>
            table === "nurse_analytics" ? h.state.analytics : h.state.featured,
        }),
    },
  };
});

vi.mock("@/lib/cron/alerting", () => ({
  withCronAlerting: (_n: string, handler: unknown) => handler,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client,
}));
vi.mock("@/lib/cron/email-log", () => ({ shouldSendOnce: h.shouldSendOnce }));
vi.mock("@/lib/email/send", () => ({
  sendFeaturedAnalyticsEmail: h.sendFeaturedAnalyticsEmail,
}));
vi.mock("@/lib/nurses/visibility", () => ({
  applyVisibleNurseFilter: (q: unknown) => q,
}));

process.env.CRON_SECRET = "test-secret";

import { GET } from "./route";

function req(authed = true) {
  return {
    headers: {
      get: (k: string) =>
        k === "authorization" && authed ? "Bearer test-secret" : null,
    },
  } as unknown as Parameters<typeof GET>[0];
}

const featuredNurse = () => ({
  user_id: "nurse-1",
  users: {
    email: "nurse@example.com",
    first_name: "Nia",
    is_deleted: false,
    is_suspended: false,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.shouldSendOnce.mockResolvedValue(true);
  h.state.featured = { data: [], error: null };
  h.state.analytics = { data: [] };
});

describe("featured-analytics cron", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
  });

  // Seeded with a featured nurse who has activity to report, and kept separate
  // from the status assertion above: against an empty result set this would hold
  // whether or not the guard exists, and folded in after a failing status expect
  // it would never run at all (#629).
  it("sends no analytics email when unauthenticated", async () => {
    h.state.featured = { data: [featuredNurse()], error: null };
    h.state.analytics = { data: [{ profile_views: 5, saves: 1, reveals: 2 }] };

    await GET(req(false));

    expect(h.shouldSendOnce).not.toHaveBeenCalled();
    expect(h.sendFeaturedAnalyticsEmail).not.toHaveBeenCalled();
  });

  it("emails a nurse with activity and dedups by ISO week", async () => {
    h.state.featured = { data: [featuredNurse()], error: null };
    h.state.analytics = {
      data: [{ profile_views: 5, saves: 1, reveals: 2 }],
    };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0 });
    expect(h.shouldSendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        emailType: "featured_analytics",
        dedupKey: expect.stringMatching(/^week_\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(h.sendFeaturedAnalyticsEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a nurse with zero activity in both windows", async () => {
    h.state.featured = { data: [featuredNurse()], error: null };
    h.state.analytics = { data: [] };
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1 });
    expect(h.shouldSendOnce).not.toHaveBeenCalled();
    expect(h.sendFeaturedAnalyticsEmail).not.toHaveBeenCalled();
  });

  it("surfaces a featured-nurse query failure as a 500", async () => {
    h.state.featured = { data: [], error: { message: "db down" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
