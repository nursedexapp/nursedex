// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cronRequest as fakeRequest,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

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

  return {
    state,
    client,
    resetCall: () => (state.callCount = 0),
    sendOnce: vi.fn(async (_c: unknown, _a: unknown, send: () => Promise<boolean>): Promise<"sent" | "skipped" | "failed"> => ((await send()) ? "sent" : "failed")),
    sendAccessExpiryReminderEmail: vi.fn(async () => true),
  };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));
vi.mock("@/lib/cron/email-log", () => ({
  sendOnce: h.sendOnce,
}));
vi.mock("@/lib/email/send", () => ({
  sendAccessExpiryReminderEmail: h.sendAccessExpiryReminderEmail,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  h.resetCall();
  h.state.results = [];
});

// A family whose access expires inside every reminder window, so an
// unauthenticated call that reached the handler would definitely mail them.
// Seeding a row that provokes a send is the point: against empty results the
// "no email" assertion below passes with or without the guard.
const dueFamily = {
  data: [
    {
      id: "sub_1",
      user_id: "user_1",
      access_expires_at: "2026-08-01T00:00:00.000Z",
      users: {
        email: "family@example.com",
        first_name: "Family",
        is_deleted: false,
        is_suspended: false,
      },
    },
  ],
  error: null,
};

describe("access-expiry cron: auth guard", () => {
  describeCronAuthGuard({
    GET,
    seedSideEffect: () => {
      h.state.results = [dueFamily, dueFamily, dueFamily];
    },
    sideEffectSpies: {
      sendOnce: h.sendOnce,
      sendAccessExpiryReminderEmail: h.sendAccessExpiryReminderEmail,
    },
  });

  it("queries nothing when unauthenticated", async () => {
    // This route's reads go through a hand-rolled counter rather than a spy, so
    // the shared helper cannot see them: assert on it directly.
    h.state.results = [dueFamily, dueFamily, dueFamily];

    await GET(fakeRequest(false));

    expect(h.state.callCount).toBe(0);
  });
});

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
