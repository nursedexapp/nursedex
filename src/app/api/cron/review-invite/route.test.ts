// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createQueryBuilder,
  createRangeFilterRecorder,
} from "../../../../../test/supabase-mock";
import {
  cronRequest as req,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

const h = vi.hoisted(() => {
  const state = {
    nurses: {
      data: [] as unknown[],
      error: null as { message: string } | null,
    },
  };
  return {
    state,
    sendOnce: vi.fn(async (_c: unknown, _a: unknown, send: () => Promise<boolean>): Promise<"sent" | "skipped" | "failed"> => ((await send()) ? "sent" : "failed")),
    sendReviewInviteEmail: vi.fn(async () => true),
    client: {
      from: () =>
        createQueryBuilder({
          // `filters` is initialized below; this closure only runs inside a test.
          ...filters.handlers,
          then: () => h.state.nurses,
        }),
    },
  };
});

const filters = createRangeFilterRecorder();

vi.mock("@/lib/cron/alerting", () => ({
  withCronAlerting: (_n: string, handler: unknown) => handler,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client,
}));
vi.mock("@/lib/cron/email-log", () => ({ sendOnce: h.sendOnce }));
vi.mock("@/lib/email/send", () => ({
  sendReviewInviteEmail: h.sendReviewInviteEmail,
}));
vi.mock("@/lib/nurses/visibility", () => ({
  applyVisibleNurseFilter: (q: unknown) => q,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

const nurse = () => ({
  user_id: "nurse-1",
  slug: "nia-rn",
  verified_at: "2026-06-01T00:00:00.000Z",
  users: {
    email: "nurse@example.com",
    first_name: "Nia",
    is_deleted: false,
    is_suspended: false,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  filters.reset();
  h.state.nurses = { data: [], error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("review-invite cron", () => {
  describeCronAuthGuard({
    GET,
    seedSideEffect: () => {
      h.state.nurses = { data: [nurse()], error: null };
    },
    sideEffectSpies: {
      sendOnce: h.sendOnce,
      sendReviewInviteEmail: h.sendReviewInviteEmail,
    },
  });

  it("sends the invite with the nurse's review link and a stable dedup key", async () => {
    h.state.nurses = { data: [nurse()], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0, failed: 0 });
    expect(h.sendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        emailType: "review_invite",
        dedupKey: "post_verification_v1",
      }),
      expect.any(Function),
    );
    expect(h.sendReviewInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "nurse@example.com",
        reviewLinkUrl: "https://nursedex.com/reviews/nia-rn",
      }),
    );
  });

  it("skips when the dedup gate has already fired", async () => {
    h.state.nurses = { data: [nurse()], error: null };
    h.sendOnce.mockResolvedValue("skipped");
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1, failed: 0 });
    expect(h.sendReviewInviteEmail).not.toHaveBeenCalled();
  });

  it("surfaces a query failure as a 500", async () => {
    h.state.nurses = { data: [], error: { message: "db down" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  // Bounds are literal dates, not a recomputation of the route's own DAY_MS
  // arithmetic, so an off-by-one fails here instead of agreeing with itself.
  describe("the verified-at window", () => {
    it("asks for nurses verified between 28 and 14 days ago", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-11T13:00:00.000Z"));

      await GET(req());

      // 28 days before Jul 11 is Jun 13; 14 days before is Jun 27.
      expect(filters.bound("gte", "verified_at")).toBe(
        "2026-06-13T13:00:00.000Z",
      );
      expect(filters.bound("lte", "verified_at")).toBe(
        "2026-06-27T13:00:00.000Z",
      );
    });

    it("puts the older bound on gte and the newer on lte, not inverted", async () => {
      // Swapping these yields gte(newer) + lte(older): an empty range that
      // matches nothing, so the cron would mail no one and still report success.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-11T13:00:00.000Z"));

      await GET(req());

      const gte = filters.bound("gte", "verified_at") as string;
      const lte = filters.bound("lte", "verified_at") as string;
      expect(new Date(gte).getTime()).toBeLessThan(new Date(lte).getTime());
    });
  });
});
