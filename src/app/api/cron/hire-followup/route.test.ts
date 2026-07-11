// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";

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
          then: () =>
            table === "hires" ? h.state.hires : h.state.reveals,
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
  sendHireFollowupEmail: h.sendHireFollowupEmail,
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
  h.shouldSendOnce.mockResolvedValue(true);
  h.state.reveals = { data: [], error: null };
  h.state.hires = { data: [], error: null };
});

describe("hire-followup cron", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
    expect(h.sendHireFollowupEmail).not.toHaveBeenCalled();
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
});
