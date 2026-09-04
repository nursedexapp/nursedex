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
    nurses: {
      data: [] as unknown[],
      error: null as { message: string } | null,
    },
  };
  return {
    state,
    sendOnce: vi.fn(async (_c: unknown, _a: unknown, send: () => Promise<boolean>): Promise<"sent" | "skipped" | "failed"> => ((await send()) ? "sent" : "failed")),
    sendUpgradeNudgeEmail: vi.fn(async () => true),
    client: { from: () => createQueryBuilder({ then: () => h.state.nurses }) },
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
  sendUpgradeNudgeEmail: h.sendUpgradeNudgeEmail,
}));
vi.mock("@/lib/nurses/visibility", () => ({
  applyVisibleNurseFilter: (q: unknown) => q,
}));
vi.mock("@/lib/profile/upsell", () => ({
  UPSELL_SAVE_THRESHOLD: 3,
  UPSELL_COOLDOWN_DAYS: 30,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

const nurse = () => ({
  user_id: "nurse-1",
  save_count_for_upsell: 5,
  last_upsell_shown_at: null,
  users: {
    email: "nurse@example.com",
    first_name: "Nia",
    is_deleted: false,
    is_suspended: false,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.state.nurses = { data: [], error: null };
});

describe("upgrade-nudge cron", () => {
  describeCronAuthGuard({
    GET,
    seedSideEffect: () => {
      h.state.nurses = { data: [nurse()], error: null };
    },
    sideEffectSpies: {
      sendOnce: h.sendOnce,
      sendUpgradeNudgeEmail: h.sendUpgradeNudgeEmail,
    },
  });

  it("sends a nudge and dedups by week bucket", async () => {
    h.state.nurses = { data: [nurse()], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0, failed: 0 });
    expect(h.sendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        emailType: "upgrade_nudge",
        dedupKey: expect.stringMatching(/^week_\d{4}-\d{2}-\d{2}$/),
      }),
      expect.any(Function),
    );
    expect(h.sendUpgradeNudgeEmail).toHaveBeenCalledTimes(1);
  });

  it("skips when the dedup gate has already fired this week", async () => {
    h.state.nurses = { data: [nurse()], error: null };
    h.sendOnce.mockResolvedValue("skipped");
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1, failed: 0 });
    expect(h.sendUpgradeNudgeEmail).not.toHaveBeenCalled();
  });

  it("surfaces a query failure as a 500", async () => {
    h.state.nurses = { data: [], error: { message: "db down" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
