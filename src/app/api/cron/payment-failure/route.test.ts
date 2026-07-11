// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const sentKeys = new Set<string>();
  const shouldSendOnceCalls: Array<{ dedupKey: string }> = [];
  const shouldSendOnce = vi.fn(
    async (_supabase: unknown, args: { recipientUserId: string; emailType: string; dedupKey: string }) => {
      shouldSendOnceCalls.push({ dedupKey: args.dedupKey });
      const key = `${args.recipientUserId}|${args.emailType}|${args.dedupKey}`;
      if (sentKeys.has(key)) return false;
      sentKeys.add(key);
      return true;
    },
  );
  const warningEmail = vi.fn(async () => {});
  const finalEmail = vi.fn(async () => {});
  const state = {
    subs: [] as unknown[],
    downgradeError: null as { message: string } | null,
  };
  const calls: string[] = [];

  function client() {
    return {
      from: (table: string) => {
        if (table === "subscriptions") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: state.subs, error: null }),
            }),
            update: () => {
              calls.push("subscriptions.update");
              return { eq: () => Promise.resolve({ error: state.downgradeError }) };
            },
          };
        }
        return {
          update: () => {
            calls.push("nurse_profiles.update");
            return { eq: () => Promise.resolve({ error: state.downgradeError }) };
          },
        };
      },
    };
  }

  return { sentKeys, shouldSendOnce, shouldSendOnceCalls, warningEmail, finalEmail, state, calls, client };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));
vi.mock("@/lib/cron/email-log", () => ({
  shouldSendOnce: h.shouldSendOnce,
}));
vi.mock("@/lib/email/send", () => ({
  sendPaymentFailureWarningEmail: h.warningEmail,
  sendPaymentFailureFinalEmail: h.finalEmail,
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

const DAY_MS = 24 * 60 * 60 * 1000;

function fakeSub(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    user_id: "user_1",
    plan_type: "family_access",
    status: "past_due",
    current_period_end: new Date(Date.now() - 1 * DAY_MS).toISOString(),
    access_expires_at: null,
    users: {
      email: "family@example.com",
      first_name: "Family",
      is_deleted: false,
      is_suspended: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sentKeys.clear();
  h.shouldSendOnceCalls.length = 0;
  h.state.subs = [];
  h.state.downgradeError = null;
  h.calls.length = 0;
});

describe("payment-failure cron: auth guard", () => {
  // Seeded three days past due, which is the loudest possible path: an
  // unauthenticated call that reached the handler would mail the final notice
  // AND downgrade the plan. Against an empty subscription list these
  // assertions would pass whether or not the guard exists.
  const pastDue = () =>
    fakeSub({
      current_period_end: new Date(Date.now() - 3 * DAY_MS).toISOString(),
    });

  it("returns 401 without the cron secret", async () => {
    h.state.subs = [pastDue()];

    const res = await GET(fakeRequest(false));

    expect(res.status).toBe(401);
  });

  it("sends no dunning mail and downgrades nobody when unauthenticated", async () => {
    h.state.subs = [pastDue()];

    await GET(fakeRequest(false));

    expect(h.warningEmail).not.toHaveBeenCalled();
    expect(h.finalEmail).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });
});

describe("payment-failure cron: normal daily progression", () => {
  it("sends the day-1 warning for a subscription exactly one day past due", async () => {
    h.state.subs = [fakeSub()];

    const res = await GET(fakeRequest());
    const json = await res.json();

    expect(h.warningEmail).toHaveBeenCalledWith(
      expect.objectContaining({ dayNumber: 1 }),
    );
    expect(json.day1).toBe(1);
  });

  it("does not resend the day-1 warning once already sent", async () => {
    h.state.subs = [fakeSub()];
    h.sentKeys.add("user_1|payment_failure_warning|sub_1:pf_day1");

    await GET(fakeRequest());

    expect(h.warningEmail).not.toHaveBeenCalled();
  });
});

describe("payment-failure cron: catch-up after a missed run (#421)", () => {
  it("still sends both day-1 and day-2 warnings when the cron skipped straight to day 2", async () => {
    h.state.subs = [
      fakeSub({ current_period_end: new Date(Date.now() - 2 * DAY_MS).toISOString() }),
    ];

    const res = await GET(fakeRequest());
    const json = await res.json();

    expect(h.warningEmail).toHaveBeenCalledWith(
      expect.objectContaining({ dayNumber: 1 }),
    );
    expect(h.warningEmail).toHaveBeenCalledWith(
      expect.objectContaining({ dayNumber: 2 }),
    );
    expect(json.day1).toBe(1);
    expect(json.day2).toBe(1);
  });

  it("does not re-send day-1 on catch-up if day-1 already went out before the gap", async () => {
    h.sentKeys.add("user_1|payment_failure_warning|sub_1:pf_day1");
    h.state.subs = [
      fakeSub({ current_period_end: new Date(Date.now() - 2 * DAY_MS).toISOString() }),
    ];

    await GET(fakeRequest());

    expect(h.warningEmail).toHaveBeenCalledTimes(1);
    expect(h.warningEmail).toHaveBeenCalledWith(
      expect.objectContaining({ dayNumber: 2 }),
    );
  });
});

describe("payment-failure cron: downgrade-before-dedup ordering (#416)", () => {
  it("downgrades and sends the final email when nothing fails", async () => {
    h.state.subs = [
      fakeSub({ current_period_end: new Date(Date.now() - 3 * DAY_MS).toISOString() }),
    ];

    const res = await GET(fakeRequest());
    const json = await res.json();

    expect(h.calls).toContain("subscriptions.update");
    expect(h.finalEmail).toHaveBeenCalledOnce();
    expect(json.finalAndDowngrade).toBe(1);
  });

  it("does not mark pf_final as sent when the downgrade write fails, so it can retry", async () => {
    h.state.downgradeError = { message: "db unavailable" };
    h.state.subs = [
      fakeSub({ current_period_end: new Date(Date.now() - 3 * DAY_MS).toISOString() }),
    ];

    await GET(fakeRequest());

    expect(h.finalEmail).not.toHaveBeenCalled();
    expect(
      h.shouldSendOnceCalls.some((c) => c.dedupKey === "sub_1:pf_final"),
    ).toBe(false);
  });

  it("downgrades nurse_profiles for a nurse_featured subscription", async () => {
    h.state.subs = [
      fakeSub({
        plan_type: "nurse_featured",
        current_period_end: new Date(Date.now() - 3 * DAY_MS).toISOString(),
      }),
    ];

    await GET(fakeRequest());

    expect(h.calls).toContain("nurse_profiles.update");
    expect(h.calls).not.toContain("subscriptions.update");
  });
});
