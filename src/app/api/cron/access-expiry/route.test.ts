// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    // Keyed by call index so each of the 3 REMINDER_DAYS windows can be
    // configured independently.
    results: [] as Array<{
      data: unknown[];
      error: { message: string } | null;
    }>,
    callCount: 0,
  };

  function client() {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => ({
              lt: () => {
                const result = state.results[state.callCount] ?? {
                  data: [],
                  error: null,
                };
                state.callCount++;
                return Promise.resolve(result);
              },
            }),
          }),
        }),
      }),
    };
  }

  return { state, client, resetCall: () => (state.callCount = 0) };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));
vi.mock("@/lib/cron/email-log", () => ({
  shouldSendOnce: vi.fn(async () => true),
}));
vi.mock("@/lib/email/send", () => ({
  sendAccessExpiryReminderEmail: vi.fn(async () => {}),
}));

process.env.CRON_SECRET = "test-secret";

import { GET } from "./route";

function fakeRequest(): Parameters<typeof GET>[0] {
  return {
    headers: {
      get: (k: string) => (k === "authorization" ? "Bearer test-secret" : null),
    },
  } as unknown as Parameters<typeof GET>[0];
}

describe("access-expiry cron: query failure surfaces instead of being swallowed", () => {
  it("returns a failing response when one of the three reminder windows' query errors", async () => {
    h.resetCall();
    h.state.results = [
      { data: [], error: { message: "db unavailable" } },
      { data: [], error: null },
      { data: [], error: null },
    ];

    const res = await GET(fakeRequest());

    expect(res.ok).toBe(false);
  });

  it("still processes the other two windows when only one query fails", async () => {
    h.resetCall();
    h.state.results = [
      { data: [], error: { message: "db unavailable" } },
      { data: [], error: null },
      { data: [], error: null },
    ];

    await GET(fakeRequest());

    expect(h.state.callCount).toBe(3);
  });

  it("succeeds normally when all three windows query cleanly", async () => {
    h.resetCall();
    h.state.results = [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];

    const res = await GET(fakeRequest());

    expect(res.status).toBe(200);
  });
});
