// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const state = {
    subs: { data: [] as unknown[], error: null as { message: string } | null },
  };
  return {
    state,
    shouldSendOnce: vi.fn(async () => true),
    sendRenewalReminderEmail: vi.fn(async () => {}),
    client: {
      from: () =>
        createQueryBuilder({ then: () => h.state.subs }),
    },
  };
});

vi.mock("@/lib/cron/alerting", () => ({
  withCronAlerting: (_name: string, handler: unknown) => handler,
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client,
}));
vi.mock("@/lib/cron/email-log", () => ({ shouldSendOnce: h.shouldSendOnce }));
vi.mock("@/lib/email/send", () => ({
  sendRenewalReminderEmail: h.sendRenewalReminderEmail,
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
  h.shouldSendOnce.mockResolvedValue(true);
  h.state.subs = { data: [], error: null };
});

describe("renewal-reminder cron", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
    expect(h.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it("sends a reminder and dedups by subscription id + period end", async () => {
    h.state.subs = { data: [sub()], error: null };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: 1, skipped: 0 });
    expect(h.shouldSendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        emailType: "renewal_reminder",
        dedupKey: "sub-1:2026-08-01T00:00:00.000Z",
      }),
    );
    expect(h.sendRenewalReminderEmail).toHaveBeenCalledTimes(1);
  });

  it("skips deleted or suspended users without sending", async () => {
    h.state.subs = {
      data: [sub({ users: { email: "x", is_deleted: true } })],
      error: null,
    };
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1 });
    expect(h.shouldSendOnce).not.toHaveBeenCalled();
    expect(h.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it("skips when the dedup gate has already fired for this period", async () => {
    h.state.subs = { data: [sub()], error: null };
    h.shouldSendOnce.mockResolvedValue(false);
    const res = await GET(req());
    expect(await res.json()).toEqual({ success: true, sent: 0, skipped: 1 });
    expect(h.sendRenewalReminderEmail).not.toHaveBeenCalled();
  });

  it("surfaces a query failure as a 500 instead of swallowing it", async () => {
    h.state.subs = { data: [], error: { message: "db down" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
