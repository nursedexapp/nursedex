// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";
import {
  cronRequest as req,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";

/**
 * Tells a verified nurse whose profile is empty that families cannot see her
 * (#732). She is not in the directory, and the in-product message only
 * reaches her if she comes back on her own, which 27 of the 40 who signed up
 * before July have not done.
 *
 * It does NOT send until it is deliberately switched on. The default is the
 * quiet one: forgetting to set the switch means nobody is emailed, rather
 * than 40 people being emailed by a deploy.
 */
const h = vi.hoisted(() => {
  const state = {
    nurses: {
      data: null as unknown[] | null,
      error: null as { message: string } | null,
    },
  };
  return {
    state,
    shouldSendOnce: vi.fn(async () => true),
    sendNotListedNudgeEmail: vi.fn(async () => true),
    releaseClaim: vi.fn(async (_dedupKey: unknown) => {}),
    client: {
      from: (table: string) =>
        table === "email_log"
          ? {
              // Hand-rolled rather than the shared builder: this asserts the
              // exact delete chain that releases a claim, and the builder
              // answers every method by chaining, which would let a wrong
              // chain pass.
              delete: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: async (_c: string, v: unknown) => h.releaseClaim(v),
                  }),
                }),
              }),
            }
          : createQueryBuilder({ then: () => h.state.nurses }),
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
  sendNotListedNudgeEmail: h.sendNotListedNudgeEmail,
}));
vi.mock("@/lib/nurses/visibility", () => ({
  applyUnlistedNurseFilter: (q: unknown) => q,
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

const nurse = (id = "nurse-1") => ({
  user_id: id,
  users: {
    email: `${id}@example.com`,
    first_name: "Nia",
    is_deleted: false,
    is_suspended: false,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.shouldSendOnce.mockResolvedValue(true);
  h.sendNotListedNudgeEmail.mockResolvedValue(true);
  h.state.nurses = { data: [], error: null };
  delete process.env.NOT_LISTED_NUDGE_SEND;
});

describeCronAuthGuard({
  GET,
  // Seeded so an unauthenticated request that reached the handler WOULD email
  // somebody: a nurse to email, and the send switch on. Against an empty
  // roster, or with the switch off, the assertions below would hold whether
  // or not the guard exists.
  seedSideEffect: () => {
    process.env.NOT_LISTED_NUDGE_SEND = "true";
    h.state.nurses = { data: [nurse("a")], error: null };
  },
  sideEffectSpies: {
    sendNotListedNudgeEmail: h.sendNotListedNudgeEmail,
    shouldSendOnce: h.shouldSendOnce,
  },
});

describe("the not-listed nudge, switched off", () => {
  it("emails nobody and says how many it would have", async () => {
    h.state.nurses = { data: [nurse("a"), nurse("b")], error: null };

    const body = await (await GET(req())).json();

    expect(h.sendNotListedNudgeEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ dryRun: true, wouldSend: 2, sent: 0 });
  });

  it("is off when the switch says anything other than true", async () => {
    process.env.NOT_LISTED_NUDGE_SEND = "1";
    h.state.nurses = { data: [nurse("a")], error: null };

    const body = await (await GET(req())).json();

    expect(h.sendNotListedNudgeEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ dryRun: true });
  });
});

describe("the not-listed nudge, switched on", () => {
  beforeEach(() => {
    process.env.NOT_LISTED_NUDGE_SEND = "true";
  });

  it("emails each unlisted nurse once", async () => {
    h.state.nurses = { data: [nurse("a"), nurse("b")], error: null };

    const body = await (await GET(req())).json();

    expect(h.sendNotListedNudgeEmail).toHaveBeenCalledTimes(2);
    expect(h.sendNotListedNudgeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@example.com", firstName: "Nia" }),
    );
    expect(body).toMatchObject({ sent: 2, skipped: 0 });
  });

  it("does not email a nurse who has already had it", async () => {
    h.state.nurses = { data: [nurse("a")], error: null };
    h.shouldSendOnce.mockResolvedValue(false);

    const body = await (await GET(req())).json();

    expect(h.sendNotListedNudgeEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("lets the next run retry a nurse whose email failed to go out", async () => {
    // The dedup row is claimed BEFORE the send, so that two overlapping runs
    // cannot both email her. That means a failed send would otherwise mark
    // her as told forever and she would never hear from us. Releasing the
    // claim risks her getting it twice if the failure was only in the reply,
    // which is much the better of the two mistakes.
    h.state.nurses = { data: [nurse("a")], error: null };
    h.sendNotListedNudgeEmail.mockResolvedValue(false);

    const body = await (await GET(req())).json();

    expect(h.releaseClaim).toHaveBeenCalledWith("v1");
    expect(body).toMatchObject({ sent: 0, failed: 1 });
  });

  it("refuses rather than emailing when it cannot read the roster", async () => {
    // An empty answer and a failed read are different things. Treating a
    // failed read as "no unlisted nurses" would report a healthy run that
    // silently stopped telling anybody.
    h.state.nurses = { data: null, error: { message: "connection lost" } };

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect(h.sendNotListedNudgeEmail).not.toHaveBeenCalled();
  });
});
