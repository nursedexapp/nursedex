// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cronRequest as fakeRequest,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

/**
 * This suite runs the REAL email-log helper against a fake email_log table
 * rather than stubbing the claim (#415). The claim, the send and the release of
 * a failed claim are one mechanism, and stubbing it here would have left the
 * wiring between this cron and that helper proved by nothing. The fake table is
 * the whole of what is stood in for: an insert that rejects a duplicate with
 * 23505, and a delete that gives the key back.
 */
const h = vi.hoisted(() => {
  const sentKeys = new Set<string>();
  const claimAttempts: Array<{ dedupKey: string }> = [];
  const warningEmail = vi.fn(async () => true);
  const finalEmail = vi.fn(async () => true);
  const state = {
    subs: [] as unknown[],
    downgradeError: null as { message: string } | null,
  };
  const calls: string[] = [];

  /** The fake email_log table: one row per recipient, type and dedup key. */
  function emailLogTable() {
    const filters: Record<string, string> = {};
    const builder = {
      insert: (payload: Record<string, string>) => {
        claimAttempts.push({ dedupKey: payload.dedup_key });
        const key = `${payload.recipient_user_id}|${payload.email_type}|${payload.dedup_key}`;
        if (sentKeys.has(key)) {
          return Promise.resolve({
            error: { message: "duplicate key value", code: "23505" },
          });
        }
        sentKeys.add(key);
        return Promise.resolve({ error: null });
      },
      delete: () => {
        calls.push("email_log.delete");
        return builder;
      },
      eq: (column: string, value: string) => {
        filters[column] = value;
        return builder;
      },
      then: (resolve: (v: { error: null }) => unknown) => {
        sentKeys.delete(
          `${filters.recipient_user_id}|${filters.email_type}|${filters.dedup_key}`,
        );
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return builder;
  }

  function client() {
    return {
      from: (table: string) => {
        if (table === "email_log") return emailLogTable();
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

  return { sentKeys, claimAttempts, warningEmail, finalEmail, state, calls, client };
});

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.client(),
}));
// email-log reports a failed send here, and the cron alerting wrapper reports
// a thrown one, so both are stood in for.
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@/lib/email/send", () => ({
  sendPaymentFailureWarningEmail: h.warningEmail,
  sendPaymentFailureFinalEmail: h.finalEmail,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

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
  h.warningEmail.mockResolvedValue(true);
  h.finalEmail.mockResolvedValue(true);
  h.sentKeys.clear();
  h.claimAttempts.length = 0;
  h.state.subs = [];
  h.state.downgradeError = null;
  h.calls.length = 0;
});

describe("payment-failure cron: auth guard", () => {
  // Seeded three days past due, the loudest possible path: an unauthenticated
  // call that reached the handler would mail the final notice AND downgrade.
  const seedPastDue = () => {
    h.state.subs = [
      fakeSub({
        current_period_end: new Date(Date.now() - 3 * DAY_MS).toISOString(),
      }),
    ];
  };

  describeCronAuthGuard({
    GET,
    seedSideEffect: seedPastDue,
    sideEffectSpies: {
      warningEmail: h.warningEmail,
      finalEmail: h.finalEmail,
    },
  });

  it("downgrades nobody when unauthenticated", async () => {
    // The downgrade writes are recorded in a plain array rather than a spy, so
    // the shared helper cannot see them: assert on it directly.
    seedPastDue();

    await GET(fakeRequest(false));

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
    expect(h.claimAttempts.some((c) => c.dedupKey === "sub_1:pf_final")).toBe(
      false,
    );
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

/**
 * A send that does not land used to leave the claim standing, so the person was
 * recorded as told and no later run ever tried again (#415). The final notice
 * is the worst case: the downgrade has already happened, so they lose access
 * and are never told why.
 */
describe("payment-failure cron: a failed send is retried tomorrow", () => {
  const pastDue = () =>
    fakeSub({
      current_period_end: new Date(Date.now() - 3 * DAY_MS).toISOString(),
    });

  it("releases the claim when the final notice does not go out", async () => {
    h.finalEmail.mockResolvedValue(false);
    h.state.subs = [pastDue()];

    await GET(fakeRequest());

    expect(h.calls).toContain("email_log.delete");
    expect(h.sentKeys.has("user_1|payment_failure_final|sub_1:pf_final")).toBe(
      false,
    );
  });

  it("sends it again on the next run rather than skipping the person", async () => {
    h.finalEmail.mockResolvedValue(false);
    h.state.subs = [pastDue()];
    await GET(fakeRequest());
    expect(h.finalEmail).toHaveBeenCalledTimes(1);

    // Tomorrow, with the transport working again.
    h.finalEmail.mockResolvedValue(true);
    h.state.subs = [pastDue()];
    const res = await GET(fakeRequest());
    const json = await res.json();

    expect(h.finalEmail).toHaveBeenCalledTimes(2);
    expect(json.finalAndDowngrade).toBe(1);
  });

  it("answers non-2xx when the whole run told nobody", async () => {
    // Three days past due attempts day 1, day 2 and the final notice, so an
    // outage means all three fail. That is the case the alerting has to see:
    // a 200 here would write a heartbeat for a run that delivered nothing.
    h.warningEmail.mockResolvedValue(false);
    h.finalEmail.mockResolvedValue(false);
    h.state.subs = [pastDue()];

    const res = await GET(fakeRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.failed).toBe(3);
  });

  /**
   * Each person lands in exactly one bucket. "Nothing was sent to this person"
   * and "this person was skipped" became the same condition when the failure
   * path was added, so somebody whose emails all failed was counted in both,
   * and the two numbers the alerting is read from disagreed with each other.
   */
  it("counts a person whose sends all failed as failed, not also as skipped", async () => {
    h.warningEmail.mockResolvedValue(false);
    h.finalEmail.mockResolvedValue(false);
    h.state.subs = [pastDue()];

    const json = await (await GET(fakeRequest())).json();

    expect(json.failed).toBe(3);
    expect(json.skipped).toBe(0);
  });

  it("still counts a person nothing was attempted for as skipped", async () => {
    // Already claimed, so every step is a skip and nothing is attempted. This
    // is the case the skipped counter exists for, and it has to survive the
    // fix above rather than being traded for it.
    h.sentKeys.add("user_1|payment_failure_warning|sub_1:pf_day1");
    h.sentKeys.add("user_1|payment_failure_warning|sub_1:pf_day2");
    h.sentKeys.add("user_1|payment_failure_final|sub_1:pf_final");
    h.state.subs = [pastDue()];

    const json = await (await GET(fakeRequest())).json();

    expect(json.skipped).toBe(1);
    expect(json.failed).toBe(0);
  });

  it("keeps a 200 and reports the count when only some of the run failed", async () => {
    // Day 1 and day 2 land, the final notice does not.
    h.warningEmail.mockResolvedValue(true);
    h.finalEmail.mockResolvedValue(false);
    h.state.subs = [pastDue()];

    const res = await GET(fakeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.day1).toBe(1);
    expect(json.failed).toBe(1);
  });
});
