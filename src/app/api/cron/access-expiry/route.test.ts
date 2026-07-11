// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

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
    shouldSendOnce: vi.fn(async () => true),
    sendAccessExpiryReminderEmail: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));
vi.mock("@/lib/cron/email-log", () => ({
  shouldSendOnce: h.shouldSendOnce,
}));
vi.mock("@/lib/email/send", () => ({
  sendAccessExpiryReminderEmail: h.sendAccessExpiryReminderEmail,
}));

process.env.CRON_SECRET = "test-secret";

import { GET } from "./route";

function fakeRequest(authed = true): Parameters<typeof GET>[0] {
  return {
    headers: {
      get: (k: string) =>
        k === "authorization" && authed ? "Bearer test-secret" : null,
    },
  } as unknown as Parameters<typeof GET>[0];
}

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
  it("returns 401 without the cron secret", async () => {
    h.state.results = [dueFamily, dueFamily, dueFamily];

    const res = await GET(fakeRequest(false));

    expect(res.status).toBe(401);
  });

  it("touches neither the database nor the mailer when unauthenticated", async () => {
    // The guard has to short-circuit before the handler, not merely swap the
    // status code: this is a public endpoint that reads subscriber rows and
    // mails families.
    h.state.results = [dueFamily, dueFamily, dueFamily];

    await GET(fakeRequest(false));

    expect(h.state.callCount).toBe(0);
    expect(h.sendAccessExpiryReminderEmail).not.toHaveBeenCalled();
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
