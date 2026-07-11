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
    sendReviewInviteEmail: vi.fn(async () => {}),
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
  h.shouldSendOnce.mockResolvedValue(true);
  h.state.nurses = { data: [], error: null };
});

describe("review-invite cron", () => {
  it("returns 401 without the cron secret", async () => {
    const res = await GET(req(false));
    expect(res.status).toBe(401);
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
});
