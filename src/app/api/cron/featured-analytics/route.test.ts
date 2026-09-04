// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";
import {
  cronRequest as req,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

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
    sendOnce: vi.fn(
      async (
        _supabase: unknown,
        _args: unknown,
        send: () => Promise<boolean>,
      ) => ((await send()) ? "sent" : "failed"),
    ),
    sendFeaturedAnalyticsEmail: vi.fn(async () => true),
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
vi.mock("@/lib/cron/email-log", () => ({ sendOnce: h.sendOnce }));
vi.mock("@/lib/email/send", () => ({
  sendFeaturedAnalyticsEmail: h.sendFeaturedAnalyticsEmail,
}));
vi.mock("@/lib/nurses/visibility", () => ({
  applyVisibleNurseFilter: (q: unknown) => q,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

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
  h.sendFeaturedAnalyticsEmail.mockResolvedValue(true);
  h.state.featured = { data: [], error: null };
  h.state.analytics = { data: [] };
});

describe("featured-analytics cron", () => {
  describeCronAuthGuard({
    GET,
    seedSideEffect: () => {
      h.state.featured = { data: [featuredNurse()], error: null };
      h.state.analytics = { data: [{ profile_views: 5, saves: 1, reveals: 2 }] };
    },
    sideEffectSpies: {
      shouldSendOnce: h.sendOnce,
      sendFeaturedAnalyticsEmail: h.sendFeaturedAnalyticsEmail,
    },
  });

  it("emails a nurse with activity and dedups by ISO week", async () => {
    h.state.featured = { data: [featuredNurse()], error: null };
    h.state.analytics = {
      data: [{ profile_views: 5, saves: 1, reveals: 2 }],
    };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0, failed: 0 });
    expect(h.sendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        emailType: "featured_analytics",
        dedupKey: expect.stringMatching(/^week_\d{4}-\d{2}-\d{2}$/),
      }),
      expect.any(Function),
    );
    expect(h.sendFeaturedAnalyticsEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a nurse with zero activity in both windows", async () => {
    h.state.featured = { data: [featuredNurse()], error: null };
    h.state.analytics = { data: [] };
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1, failed: 0 });
    expect(h.sendOnce).not.toHaveBeenCalled();
    expect(h.sendFeaturedAnalyticsEmail).not.toHaveBeenCalled();
  });

  it("surfaces a featured-nurse query failure as a 500", async () => {
    h.state.featured = { data: [], error: { message: "db down" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
