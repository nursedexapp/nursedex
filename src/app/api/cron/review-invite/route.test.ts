// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createQueryBuilder,
  createRangeFilterRecorder,
} from "../../../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const state = {
    nurses: {
      data: [] as unknown[],
      error: null as { message: string } | null,
    },
  };
  return {
    state,
    shouldSendOnce: vi.fn(async () => true),
    sendReviewInviteEmail: vi.fn(async () => {}),
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
vi.mock("@/lib/cron/email-log", () => ({ shouldSendOnce: h.shouldSendOnce }));
vi.mock("@/lib/email/send", () => ({
  sendReviewInviteEmail: h.sendReviewInviteEmail,
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
  h.shouldSendOnce.mockResolvedValue(true);
  h.state.nurses = { data: [], error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("review-invite cron", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
  });

  // Seeded with a nurse due an invite, and kept separate from the status
  // assertion above: against an empty result set this would hold whether or not
  // the guard exists, and folded in after a failing status expect it would never
  // run at all (#629).
  it("sends no invite when unauthenticated", async () => {
    h.state.nurses = { data: [nurse()], error: null };

    await GET(req(false));

    expect(h.shouldSendOnce).not.toHaveBeenCalled();
    expect(h.sendReviewInviteEmail).not.toHaveBeenCalled();
  });

  it("sends the invite with the nurse's review link and a stable dedup key", async () => {
    h.state.nurses = { data: [nurse()], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0 });
    expect(h.shouldSendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        emailType: "review_invite",
        dedupKey: "post_verification_v1",
      }),
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
    h.shouldSendOnce.mockResolvedValue(false);
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1 });
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
