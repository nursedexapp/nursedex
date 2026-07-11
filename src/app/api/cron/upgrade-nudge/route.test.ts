// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";

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
    sendUpgradeNudgeEmail: vi.fn(async () => {}),
    client: { from: () => createQueryBuilder({ then: () => h.state.nurses }) },
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
  sendUpgradeNudgeEmail: h.sendUpgradeNudgeEmail,
}));
vi.mock("@/lib/nurses/visibility", () => ({
  applyVisibleNurseFilter: (q: unknown) => q,
}));
vi.mock("@/lib/profile/upsell", () => ({
  UPSELL_SAVE_THRESHOLD: 3,
  UPSELL_COOLDOWN_DAYS: 30,
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
  h.shouldSendOnce.mockResolvedValue(true);
  h.state.nurses = { data: [], error: null };
});

describe("upgrade-nudge cron", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
  });

  // Seeded with a nurse who is due a nudge, and kept separate from the status
  // assertion above: against an empty result set this would hold whether or not
  // the guard exists, and folded in after a failing status expect it would never
  // run at all (#629).
  it("sends no nudge when unauthenticated", async () => {
    h.state.nurses = { data: [nurse()], error: null };

    await GET(req(false));

    expect(h.shouldSendOnce).not.toHaveBeenCalled();
    expect(h.sendUpgradeNudgeEmail).not.toHaveBeenCalled();
  });

  it("sends a nudge and dedups by week bucket", async () => {
    h.state.nurses = { data: [nurse()], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0 });
    expect(h.shouldSendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        emailType: "upgrade_nudge",
        dedupKey: expect.stringMatching(/^week_\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(h.sendUpgradeNudgeEmail).toHaveBeenCalledTimes(1);
  });

  it("skips when the dedup gate has already fired this week", async () => {
    h.state.nurses = { data: [nurse()], error: null };
    h.shouldSendOnce.mockResolvedValue(false);
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1 });
    expect(h.sendUpgradeNudgeEmail).not.toHaveBeenCalled();
  });

  it("surfaces a query failure as a 500", async () => {
    h.state.nurses = { data: [], error: { message: "db down" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
