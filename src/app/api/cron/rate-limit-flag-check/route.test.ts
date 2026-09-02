// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";
import { RATE_LIMITS } from "@/lib/constants";
import { FLAGGED_RECENT_DAYS, flaggedSinceDate } from "@/lib/rate-limit/flagged";
import {
  cronRequest,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

const h = vi.hoisted(() => {
  const state = {
    flaggedRows: [] as Array<{
      family_user_id: string;
      consecutive_captcha_days: number;
      date: string;
    }>,
    admins: [] as Array<{ id: string; email: string }>,
    shouldSend: true,
    sendError: null as unknown,
  };
  const calls = {
    gte: [] as unknown[][],
    emails: [] as unknown[],
  };
  return {
    state,
    calls,
    shouldSendOnce: vi.fn(async () => h.state.shouldSend),
    sendRateLimitFlaggedAdminEmail: vi.fn(async (args: unknown) => {
      h.calls.emails.push(args);
      if (h.state.sendError) throw h.state.sendError;
    }),
  };
});

function builderFor(table: string) {
  if (table === "rate_limit_reveals") {
    return createQueryBuilder({
      gte: (...args: unknown[]) => {
        h.calls.gte.push(args);
        return "chain";
      },
      order: () => ({ data: h.state.flaggedRows, error: null }),
    });
  }
  if (table === "users") {
    return createQueryBuilder({
      eq: () => ({ data: h.state.admins, error: null }),
    });
  }
  throw new Error(`unexpected table ${table}`);
}

process.env.CRON_SECRET = TEST_CRON_SECRET;
vi.mock("@/lib/cron/alerting", () => ({
  withCronAlerting: (_name: string, fn: unknown) => fn,
}));
vi.mock("@/lib/cron/email-log", () => ({ shouldSendOnce: h.shouldSendOnce }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: (t: string) => builderFor(t) }),
}));
vi.mock("@/lib/email/send", () => ({
  sendRateLimitFlaggedAdminEmail: h.sendRateLimitFlaggedAdminEmail,
}));

import { GET } from "./route";

const req = cronRequest;

beforeEach(() => {
  vi.clearAllMocks();
  h.state.flaggedRows = [];
  h.state.admins = [];
  h.state.shouldSend = true;
  h.state.sendError = null;
  h.calls.gte = [];
  h.calls.emails = [];
});

describe("rate-limit-flag-check threshold (issue #576)", () => {
  it("queries the flag threshold from RATE_LIMITS, not a hardcoded literal", async () => {
    await GET(req());
    // Compared against the constant, so bumping CONSECUTIVE_CAPTCHA_DAYS_FLAG
    // without updating the query fails here instead of silently flagging the
    // wrong accounts.
    expect(h.calls.gte).toContainEqual([
      "consecutive_captcha_days",
      RATE_LIMITS.CONSECUTIVE_CAPTCHA_DAYS_FLAG,
    ]);
  });
});

/**
 * #425: the rows recording a flag stay in the table forever, so a query with
 * no window counted every family ever flagged and mailed admins that count
 * daily. The number never returned to zero, so it never meant anything.
 */
describe("rate-limit-flag-check recency", () => {
  it("only counts flags from inside the recent window", async () => {
    await GET(req());

    const dateFilter = h.calls.gte.find((call) => call[0] === "date");
    expect(dateFilter, "the query applies no date window").toBeDefined();
    expect(dateFilter![1]).toBe(flaggedSinceDate(new Date()));
  });

  // The digest and the admin screen it links to have to answer the same
  // question, or the email says four and the page shows one (L16).
  it("uses the same window as the admin flagged tab", async () => {
    await GET(req());

    const dateFilter = h.calls.gte.find((call) => call[0] === "date");
    const start = new Date(`${dateFilter![1] as string}T00:00:00Z`);
    const daysBack = Math.round(
      (Date.now() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(daysBack).toBe(FLAGGED_RECENT_DAYS - 1);
  });
});

describe("rate-limit-flag-check behaviour", () => {
  it("sends nothing and reports none_flagged when no family is over the threshold", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(body).toMatchObject({ success: true, sent: 0, reason: "none_flagged" });
    expect(h.sendRateLimitFlaggedAdminEmail).not.toHaveBeenCalled();
  });

  it("counts each flagged family once even across several days of rows", async () => {
    h.state.flaggedRows = [
      { family_user_id: "fam-1", consecutive_captcha_days: 4, date: "2026-07-09" },
      { family_user_id: "fam-1", consecutive_captcha_days: 3, date: "2026-07-08" },
      { family_user_id: "fam-2", consecutive_captcha_days: 5, date: "2026-07-09" },
    ];
    h.state.admins = [{ id: "admin-1", email: "admin@nursedex.com" }];

    const res = await GET(req());
    const body = await res.json();

    expect(body.sent).toBe(1);
    expect(h.calls.emails).toEqual([
      expect.objectContaining({ flaggedCount: 2 }),
    ]);
  });

  it("skips an admin the digest already reached today (retry dedup)", async () => {
    h.state.flaggedRows = [
      { family_user_id: "fam-1", consecutive_captcha_days: 3, date: "2026-07-09" },
    ];
    h.state.admins = [{ id: "admin-1", email: "admin@nursedex.com" }];
    h.state.shouldSend = false;

    const body = await (await GET(req())).json();

    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
    expect(h.sendRateLimitFlaggedAdminEmail).not.toHaveBeenCalled();
  });

  // Previously this test stubbed verifyCronAuth and fed it a 401 to return:
  // circular, and blind to the real secret check.
  describeCronAuthGuard({
    GET,
    // A flagged family and an admin to notify: an unauthenticated caller
    // reaching the handler would email the admin digest.
    seedSideEffect: () => {
      h.state.flaggedRows = [
        {
          family_user_id: "fam-1",
          consecutive_captcha_days: 3,
          date: "2026-07-09",
        },
      ];
      h.state.admins = [{ id: "admin-1", email: "admin@nursedex.com" }];
    },
    sideEffectSpies: {
      shouldSendOnce: h.shouldSendOnce,
      sendRateLimitFlaggedAdminEmail: h.sendRateLimitFlaggedAdminEmail,
    },
  });

  it("queries nothing when unauthenticated", async () => {
    // This route's reads are recorded in a plain array rather than a spy, so the
    // shared helper cannot see them: assert on it directly.
    await GET(cronRequest(false));

    expect(h.calls.gte).toHaveLength(0);
  });
});
