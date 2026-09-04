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
    reveals: {
      data: [] as unknown[],
      error: null as { message: string } | null,
    },
    hires: { data: [] as unknown[], error: null as { message: string } | null },
  };
  const counts = { hiresQueries: 0 };
  return {
    state,
    counts,
    sendOnce: vi.fn(async (_c: unknown, _a: unknown, send: () => Promise<boolean>): Promise<"sent" | "skipped" | "failed"> => ((await send()) ? "sent" : "failed")),
    sendHireFollowupEmail: vi.fn(async () => true),
    client: {
      from: (table: string) => {
        if (table === "hires") counts.hiresQueries++;
        return createQueryBuilder({
          // Only the reveals query carries the date window; `filters` is
          // initialized below and this closure only runs inside a test.
          ...(table === "reveals" ? filters.handlers : {}),
          then: () => (table === "hires" ? h.state.hires : h.state.reveals),
        });
      },
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
  sendHireFollowupEmail: h.sendHireFollowupEmail,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

const reveal = (over: Record<string, unknown> = {}) => ({
  family_user_id: "fam-1",
  revealed_at: "2026-06-05T00:00:00.000Z",
  nurse_user_id: "nurse-1",
  users: {
    email: "fam@example.com",
    first_name: "Dana",
    is_deleted: false,
    is_suspended: false,
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  filters.reset();
  h.state.reveals = { data: [], error: null };
  h.state.hires = { data: [], error: null };
  h.counts.hiresQueries = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hire-followup cron", () => {
  describeCronAuthGuard({
    GET,
    seedSideEffect: () => {
      h.state.reveals = { data: [reveal()], error: null };
      h.state.hires = { data: [], error: null };
    },
    sideEffectSpies: {
      sendOnce: h.sendOnce,
      sendHireFollowupEmail: h.sendHireFollowupEmail,
    },
  });

  it("emails a family with an unrecorded reveal and dedups by day bucket", async () => {
    h.state.reveals = { data: [reveal()], error: null };
    h.state.hires = { data: [], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0, failed: 0 });
    expect(h.sendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        recipientUserId: "fam-1",
        emailType: "hire_followup",
        dedupKey: expect.stringMatching(/^bucket_\d{4}-\d{2}-\d{2}$/),
      }),
      expect.any(Function),
    );
    expect(h.sendHireFollowupEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a family that already recorded a hire for every revealed nurse", async () => {
    h.state.reveals = { data: [reveal()], error: null };
    h.state.hires = {
      data: [{ family_user_id: "fam-1", nurse_user_id: "nurse-1" }],
      error: null,
    };
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1, failed: 0 });
    expect(h.sendOnce).not.toHaveBeenCalled();
    expect(h.sendHireFollowupEmail).not.toHaveBeenCalled();
  });

  /**
   * #441: this used to run one hires query per family inside the loop. The
   * work is bounded by a seven day reveal window today, so nothing is slow
   * yet, but the cost grew with the number of families and every one of those
   * round trips came out of the same 60 second budget the email sends share.
   */
  it("asks about hires once, however many families revealed", async () => {
    h.state.reveals = {
      data: [
        reveal(),
        reveal({ family_user_id: "fam-2", nurse_user_id: "nurse-2" }),
        reveal({ family_user_id: "fam-3", nurse_user_id: "nurse-3" }),
      ],
      error: null,
    };

    await GET(req());

    expect(h.counts.hiresQueries).toBe(1);
  });

  // One query covering every family means the rows have to be matched back to
  // the family they belong to. Without that, a hire recorded by one family
  // would silence the followup to a different one.
  it("does not let one family's hire silence another family's followup", async () => {
    h.state.reveals = {
      data: [
        reveal(),
        reveal({ family_user_id: "fam-2", nurse_user_id: "nurse-2" }),
      ],
      error: null,
    };
    h.state.hires = {
      data: [{ family_user_id: "fam-1", nurse_user_id: "nurse-1" }],
      error: null,
    };

    const res = await GET(req());

    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 1, failed: 0 });
    expect(h.sendHireFollowupEmail).toHaveBeenCalledTimes(1);
  });

  it("does not count a deleted or suspended family", async () => {
    h.state.reveals = {
      data: [reveal({ users: { email: "x", is_deleted: true } })],
      error: null,
    };
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 0, failed: 0 });
    expect(h.sendHireFollowupEmail).not.toHaveBeenCalled();
  });

  it("surfaces a reveals query failure as a 500", async () => {
    h.state.reveals = { data: [], error: { message: "db down" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  // Bounds are literal dates, not a recomputation of the route's own DAY_MS
  // arithmetic, so an off-by-one fails here instead of agreeing with itself.
  describe("the revealed-at window", () => {
    it("asks for reveals between 35 and 28 days ago", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-11T13:00:00.000Z"));

      await GET(req());

      // 35 days before Jul 11 is Jun 6; 28 days before is Jun 13.
      expect(filters.bound("gte", "revealed_at")).toBe(
        "2026-06-06T13:00:00.000Z",
      );
      expect(filters.bound("lte", "revealed_at")).toBe(
        "2026-06-13T13:00:00.000Z",
      );
    });

    it("keeps the window seven days wide so daily runs neither gap nor overlap", async () => {
      // The cron runs daily and dedups, but a window narrower than the gap
      // between runs would drop families entirely on a missed day.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-11T13:00:00.000Z"));

      await GET(req());

      const gte = new Date(filters.bound("gte", "revealed_at") as string);
      const lte = new Date(filters.bound("lte", "revealed_at") as string);
      const widthDays = (lte.getTime() - gte.getTime()) / (24 * 60 * 60 * 1000);
      expect(widthDays).toBe(7);
    });
  });
});
