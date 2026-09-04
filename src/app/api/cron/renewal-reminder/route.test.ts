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
    subs: { data: [] as unknown[], error: null as { message: string } | null },
  };
  return {
    state,
    sendOnce: vi.fn(async (_c: unknown, _a: unknown, send: () => Promise<boolean>): Promise<"sent" | "skipped" | "failed"> => ((await send()) ? "sent" : "failed")),
    sendRenewalReminderEmail: vi.fn(async () => true),
    client: {
      from: () =>
        createQueryBuilder({
          // `filters` is initialized below; this closure only runs inside a test.
          ...filters.handlers,
          then: () => h.state.subs,
        }),
    },
  };
});

const filters = createRangeFilterRecorder();

vi.mock("@/lib/cron/alerting", () => ({
  withCronAlerting: (_name: string, handler: unknown) => handler,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client,
}));
vi.mock("@/lib/cron/email-log", () => ({ sendOnce: h.sendOnce }));
vi.mock("@/lib/email/send", () => ({
  sendRenewalReminderEmail: h.sendRenewalReminderEmail,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

const sub = (over: Record<string, unknown> = {}) => ({
  id: "sub-1",
  user_id: "user-1",
  plan_type: "family_access",
  billing_interval: "month",
  current_period_end: "2026-08-01T00:00:00.000Z",
  cancel_at_period_end: false,
  status: "active",
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
  h.state.subs = { data: [], error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("renewal-reminder cron", () => {
  // This cron's old guard test asserted "no email sent" against an empty result
  // set, the same vacuous shape #629 fixed elsewhere but missed here. The helper
  // requires a seed, so it cannot be written that way again.
  describeCronAuthGuard({
    GET,
    seedSideEffect: () => {
      h.state.subs = { data: [sub()], error: null };
    },
    sideEffectSpies: {
      sendOnce: h.sendOnce,
      sendRenewalReminderEmail: h.sendRenewalReminderEmail,
    },
  });

  it("sends a reminder and dedups by subscription id + period end", async () => {
    h.state.subs = { data: [sub()], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0, failed: 0 });
    expect(h.sendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        emailType: "renewal_reminder",
        dedupKey: "sub-1:2026-08-01T00:00:00.000Z",
      }),
      expect.any(Function),
    );
    expect(h.sendRenewalReminderEmail).toHaveBeenCalledTimes(1);
  });

  it("skips deleted or suspended users without sending", async () => {
    h.state.subs = {
      data: [sub({ users: { email: "x", is_deleted: true } })],
      error: null,
    };
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1, failed: 0 });
    expect(h.sendOnce).not.toHaveBeenCalled();
    expect(h.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it("skips when the dedup gate has already fired for this period", async () => {
    h.state.subs = { data: [sub()], error: null };
    h.sendOnce.mockResolvedValue("skipped");
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1, failed: 0 });
    expect(h.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it("surfaces a query failure as a 500 instead of swallowing it", async () => {
    h.state.subs = { data: [], error: { message: "db down" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  // The window bounds are written out as literal dates rather than recomputed
  // from DAY_MS: a test that repeats the implementation's arithmetic agrees
  // with an off-by-one instead of catching it (#622).
  describe("the renewal window", () => {
    it("asks for exactly the UTC day three days out", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-11T13:00:00.000Z"));

      await GET(req());

      // Three days from Jul 11 is Jul 14, and the window is that whole UTC day:
      // from Jul 14 00:00 inclusive up to Jul 15 00:00 exclusive.
      expect(filters.bound("gte", "current_period_end")).toBe(
        "2026-07-14T00:00:00.000Z",
      );
      expect(filters.bound("lt", "current_period_end")).toBe(
        "2026-07-15T00:00:00.000Z",
      );
    });

    it("covers the same day no matter what time of day the cron runs", async () => {
      // Late in the UTC day is where a naive `now + 3d` window would slide off
      // the target day and silently skip everyone renewing that morning.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-11T23:59:59.000Z"));

      await GET(req());

      expect(filters.bound("gte", "current_period_end")).toBe(
        "2026-07-14T00:00:00.000Z",
      );
      expect(filters.bound("lt", "current_period_end")).toBe(
        "2026-07-15T00:00:00.000Z",
      );
    });

    it("uses a half-open window so a renewal is never mailed twice", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-11T13:00:00.000Z"));

      await GET(req());

      // An inclusive upper bound (lte) would match midnight exactly, which is
      // also the lower bound of tomorrow's run: two reminders for one renewal.
      const methods = filters.calls
        .filter((c) => c.column === "current_period_end")
        .map((c) => c.method);
      expect(methods).toContain("lt");
      expect(methods).not.toContain("lte");
    });
  });
});
