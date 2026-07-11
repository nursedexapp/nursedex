// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";

type QueryResult = { data: unknown[] | null; error?: { message: string } };

const h = vi.hoisted(() => {
  const state = {
    pending: { data: [] as unknown[] } as QueryResult,
    admins: { data: [] as unknown[] } as QueryResult,
    slaState: "ok" as "ok" | "approaching" | "overdue",
  };
  return {
    state,
    shouldSendOnce: vi.fn(async () => true),
    sendSlaAlertAdminEmail: vi.fn(async () => {}),
    getSlaState: vi.fn(() => h.state.slaState),
    client: {
      from: (table: string) =>
        createQueryBuilder({
          then: () => (table === "users" ? h.state.admins : h.state.pending),
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
  sendSlaAlertAdminEmail: h.sendSlaAlertAdminEmail,
}));
vi.mock("@/lib/admin/sla", () => ({
  SLA_HOURS: { free: 48, featured: 24 },
  getSlaState: h.getSlaState,
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

beforeEach(() => {
  vi.clearAllMocks();
  h.shouldSendOnce.mockResolvedValue(true);
  h.state.pending = { data: [] };
  h.state.admins = { data: [] };
  h.state.slaState = "ok";
  h.getSlaState.mockImplementation(() => h.state.slaState);
});

describe("sla-alerts cron", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
    expect(h.sendSlaAlertAdminEmail).not.toHaveBeenCalled();
  });

  it("sends nothing and reports queue_clean when no verification is at risk", async () => {
    h.state.pending = {
      data: [{ user_id: "n1", tier: "free", updated_at: "2026-07-10" }],
    };
    h.state.slaState = "ok";
    const res = await GET(req());
    expect(await res.json()).toEqual({
      success: true,
      sent: 0,
      skipped: 0,
      reason: "queue_clean",
    });
    expect(h.sendSlaAlertAdminEmail).not.toHaveBeenCalled();
  });

  it("emails admins a digest with the overdue count and dedups per day", async () => {
    h.state.pending = {
      data: [{ user_id: "n1", tier: "free", updated_at: "2026-06-01" }],
    };
    h.state.slaState = "overdue";
    h.state.admins = { data: [{ id: "admin-1", email: "admin@example.com" }] };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      sent: 1,
      skipped: 0,
      overdueCount: 1,
    });
    expect(h.shouldSendOnce).toHaveBeenCalledWith(
      h.client,
      expect.objectContaining({
        recipientUserId: "admin-1",
        emailType: "sla_alert_admin",
        dedupKey: expect.stringMatching(/^bucket_\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(h.sendSlaAlertAdminEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@example.com", overdueCount: 1 }),
    );
  });

  it("fails loudly with a 500 when the pending-verification query errors", async () => {
    h.state.pending = { data: null, error: { message: "connection reset" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "Query failed" });
    expect(h.sendSlaAlertAdminEmail).not.toHaveBeenCalled();
  });

  it("fails loudly with a 500 when the admin-recipient query errors", async () => {
    h.state.pending = {
      data: [{ user_id: "n1", tier: "free", updated_at: "2026-06-01" }],
    };
    h.state.slaState = "overdue";
    h.state.admins = { data: null, error: { message: "connection reset" } };
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "Query failed" });
    expect(h.sendSlaAlertAdminEmail).not.toHaveBeenCalled();
  });

  it("skips an admin whose digest already went out today", async () => {
    h.state.pending = {
      data: [{ user_id: "n1", tier: "free", updated_at: "2026-06-01" }],
    };
    h.state.slaState = "overdue";
    h.state.admins = { data: [{ id: "admin-1", email: "admin@example.com" }] };
    h.shouldSendOnce.mockResolvedValue(false);
    const res = await GET(req());
    expect(await res.json()).toMatchObject({ sent: 0, skipped: 1 });
    expect(h.sendSlaAlertAdminEmail).not.toHaveBeenCalled();
  });
});
