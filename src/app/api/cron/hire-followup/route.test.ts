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
  return {
    state,
    shouldSendOnce: vi.fn(async () => true),
    sendHireFollowupEmail: vi.fn(async () => {}),
    client: {
      from: (table: string) =>
        createQueryBuilder({
          // Only the reveals query carries the date window; `filters` is
          // initialized below and this closure only runs inside a test.
          ...(table === "reveals" ? filters.handlers : {}),
          then: () => (table === "hires" ? h.state.hires : h.state.reveals),
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
  h.shouldSendOnce.mockResolvedValue(true);
  h.state.reveals = { data: [], error: null };
  h.state.hires = { data: [], error: null };
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
      shouldSendOnce: h.shouldSendOnce,
      sendHireFollowupEmail: h.sendHireFollowupEmail,
    },
  });

  it("emails a family with an unrecorded reveal and dedups by day bucket", async () => {
    h.state.reveals = { data: [reveal()], error: null };
    h.state.hires = { data: [], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0 });
    expect(h.shouldSendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        recipientUserId: "fam-1",
        emailType: "hire_followup",
        dedupKey: expect.stringMatching(/^bucket_\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(h.sendHireFollowupEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a family that already recorded a hire for every revealed nurse", async () => {
    h.state.reveals = { data: [reveal()], error: null };
    h.state.hires = { data: [{ nurse_user_id: "nurse-1" }], error: null };
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1 });
    expect(h.shouldSendOnce).not.toHaveBeenCalled();
    expect(h.sendHireFollowupEmail).not.toHaveBeenCalled();
  });

  it("does not count a deleted or suspended family", async () => {
    h.state.reveals = {
      data: [reveal({ users: { email: "x", is_deleted: true } })],
      error: null,
    };
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 0 });
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
