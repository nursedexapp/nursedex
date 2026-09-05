// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";
import {
  cronRequest,
  describeCronAuthGuard,
  TEST_CRON_SECRET,
} from "../../../../../test/cron-auth";
import { ALERT_LOG_PAGE } from "@/lib/sentry/alert-log-cleanup";

const h = vi.hoisted(() => {
  const getIssuesNeedingReview = vi.fn();
  const slackPost = vi.fn(async () => ({ ok: true }));
  const state: {
    loggedRows: Array<{ issue_id: string }>;
  } = { loggedRows: [] };
  const calls: { insert: unknown[]; deleteIn: unknown[]; ranges: number[] } = {
    insert: [],
    deleteIn: [],
    ranges: [],
  };
  return { getIssuesNeedingReview, slackPost, state, calls };
});

function builder() {
  return createQueryBuilder({
    select: () => "chain",
    // The log is read a page at a time now, so the terminal call is range()
    // rather than select(). Answering the whole set on the first page and an
    // empty one after keeps the loop's exit condition real rather than
    // stubbing it away (#984).
    range: (from: unknown) => {
      h.calls.ranges.push(from as number);
      // Served a page at a time out of the state, so the loop's exit
      // condition is exercised rather than stubbed away (#984).
      const start = from as number;
      return {
        data: h.state.loggedRows.slice(start, start + ALERT_LOG_PAGE),
        error: null,
      };
    },
    insert: (payload) => {
      h.calls.insert.push(payload);
      return { data: null, error: null };
    },
    in: (...args) => {
      h.calls.deleteIn.push(args);
      return { data: null, error: null };
    },
  });
}

vi.mock("@/lib/sentry/issues", () => ({
  getIssuesNeedingReview: h.getIssuesNeedingReview,
}));
vi.mock("@/lib/slack/client", () => ({
  slackPost: h.slackPost,
  ALERTS_CHANNEL_ID: "C_TEST_ALERTS",
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => builder() }),
}));

process.env.CRON_SECRET = TEST_CRON_SECRET;

import { GET } from "./route";

const req = cronRequest();

function issue(id: string) {
  return {
    id,
    shortId: `NURSEDEX-SITE-${id}`,
    title: `Error ${id}`,
    culprit: `app/route-${id}`,
    level: "error",
    permalink: `https://nursedex.sentry.io/issues/${id}/`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.loggedRows = [];
  h.calls.insert = [];
  h.calls.deleteIn = [];
  h.calls.ranges = [];
});

describe("sentry-alerts cron", () => {
  // Previously this test stubbed verifyCronAuth and asserted the route returned
  // the stub's own 401 object: circular, and blind to the real secret check.
  describeCronAuthGuard({
    GET,
    seedSideEffect: () => {
      h.getIssuesNeedingReview.mockResolvedValue([issue("1")]);
    },
    sideEffectSpies: {
      getIssuesNeedingReview: h.getIssuesNeedingReview,
      slackPost: h.slackPost,
    },
  });

  it("does nothing when no issues need review", async () => {
    h.getIssuesNeedingReview.mockResolvedValue([]);
    const res = await GET(req);
    expect(await res.json()).toEqual({
      success: true,
      alerted: 0,
      failed: 0,
      cleared: 0,
      cleanupSkipped: null,
    });
    expect(h.slackPost).not.toHaveBeenCalled();
  });

  it("posts and records a new issue needing review", async () => {
    h.getIssuesNeedingReview.mockResolvedValue([issue("1")]);

    const res = await GET(req);
    const json = await res.json();

    expect(json).toEqual({
      success: true,
      alerted: 1,
      failed: 0,
      cleared: 0,
      cleanupSkipped: null,
    });
    expect(h.slackPost).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({
        channel: "C_TEST_ALERTS",
        text: expect.stringContaining("Error 1"),
      }),
    );
    // Includes the Sentry short ID so a fix commit can reference
    // "Fixes NURSEDEX-SITE-1" to auto-close the issue in Sentry.
    expect(h.slackPost).toHaveBeenCalledWith(
      "chat.postMessage",
      expect.objectContaining({
        text: expect.stringContaining("NURSEDEX-SITE-1"),
      }),
    );
    expect(h.calls.insert).toEqual([{ issue_id: "1" }]);
  });

  it("skips an issue that was already alerted", async () => {
    h.state.loggedRows = [{ issue_id: "1" }];
    h.getIssuesNeedingReview.mockResolvedValue([issue("1")]);

    const res = await GET(req);

    expect(await res.json()).toEqual({
      success: true,
      alerted: 0,
      failed: 0,
      cleared: 0,
      cleanupSkipped: null,
    });
    expect(h.slackPost).not.toHaveBeenCalled();
    expect(h.calls.insert).toEqual([]);
  });

  it("does not record an issue whose Slack alert failed, and keeps processing the rest", async () => {
    h.getIssuesNeedingReview.mockResolvedValue([issue("1"), issue("2")]);
    h.slackPost
      .mockRejectedValueOnce(new Error("slack down"))
      .mockResolvedValueOnce({ ok: true });

    const res = await GET(req);
    const json = await res.json();

    expect(json).toEqual({
      success: true,
      alerted: 1,
      failed: 1,
      cleared: 0,
      cleanupSkipped: null,
    });
    // Only the issue whose Slack post succeeded gets recorded, a Slack
    // hiccup must not silently mark a never-delivered alert as handled.
    expect(h.calls.insert).toEqual([{ issue_id: "2" }]);
  });

  it("clears a dedup row for an issue that no longer needs review", async () => {
    h.state.loggedRows = [{ issue_id: "1" }, { issue_id: "2" }];
    h.getIssuesNeedingReview.mockResolvedValue([issue("2")]);

    const res = await GET(req);

    expect(await res.json()).toEqual({
      success: true,
      alerted: 0,
      failed: 0,
      cleared: 1,
      cleanupSkipped: null,
    });
    expect(h.calls.deleteIn).toEqual([["issue_id", ["1"]]]);
  });

  it("does not touch the dedup table when nothing is stale", async () => {
    h.state.loggedRows = [{ issue_id: "1" }];
    h.getIssuesNeedingReview.mockResolvedValue([issue("1")]);

    const res = await GET(req);

    expect(await res.json()).toEqual({
      success: true,
      alerted: 0,
      failed: 0,
      cleared: 0,
      cleanupSkipped: null,
    });
    expect(h.calls.deleteIn).toEqual([]);
  });
});

/**
 * #984. The cleanup deletes every recorded issue the latest fetch did not
 * mention. That fetch is an external call, and the route refused a FAILED one
 * but not one that came back SHORT, which is the case that actually happens.
 * Every recorded id then looked resolved, the log was emptied, and the next
 * run posted every issue to Slack again.
 */
describe("when the fetch comes back short", () => {
  it("does not empty the log because nothing was returned", async () => {
    // The exact signature: the call succeeded and returned no issues, so
    // every recorded id looks resolved.
    h.state.loggedRows = Array.from({ length: 20 }, (_, i) => ({
      issue_id: `old-${i}`,
    }));
    h.getIssuesNeedingReview.mockResolvedValue([]);

    const json = await (await GET(cronRequest())).json();

    expect(h.calls.deleteIn).toHaveLength(0);
    expect(json.cleared).toBe(0);
    expect(json.cleanupSkipped).toMatch(/no issues/i);
  });

  it("does not clear most of the log in one run", async () => {
    h.state.loggedRows = Array.from({ length: 40 }, (_, i) => ({
      issue_id: `old-${i}`,
    }));
    h.getIssuesNeedingReview.mockResolvedValue([issue("old-0")]);

    const json = await (await GET(cronRequest())).json();

    expect(h.calls.deleteIn).toHaveLength(0);
    expect(json.cleanupSkipped).toMatch(/39 of 40/);
  });

  it("still clears a normal handful, so the log does not silt up", async () => {
    // The positive control for both refusals above. Without it, a rule that
    // refused everything would satisfy them and never delete anything again,
    // and a stale row suppresses the re-alert if its issue regresses.
    h.state.loggedRows = Array.from({ length: 40 }, (_, i) => ({
      issue_id: `old-${i}`,
    }));
    h.getIssuesNeedingReview.mockResolvedValue(
      Array.from({ length: 39 }, (_, i) => issue(`old-${i}`)),
    );

    const json = await (await GET(cronRequest())).json();

    expect(json.cleanupSkipped).toBeNull();
    expect(json.cleared).toBe(1);
    expect(h.calls.deleteIn[0]).toEqual(["issue_id", ["old-39"]]);
  });
});

describe("reading the whole log", () => {
  it("keeps asking until a page comes back short", async () => {
    // PostgREST caps a select and returns a healthy looking prefix, so an
    // unbounded read treats every row past the first page as an issue never
    // alerted on: it re-alerts them, and then hands the cleanup a set that is
    // missing them, which makes them look stale too.
    //
    // A small page size here, so the loop runs for real rather than the whole
    // fixture arriving in one page and the exit condition never being tested.
    // Exactly one full page, so the read cannot tell "that is everything"
    // from "there is more" and has to ask again. A fixture one row short
    // would exit on the first page and prove nothing.
    const ids = Array.from(
      { length: ALERT_LOG_PAGE + 1 },
      (_, i) => `logged-${i}`,
    );
    h.state.loggedRows = ids.map((issue_id) => ({ issue_id }));
    h.getIssuesNeedingReview.mockResolvedValue(ids.map((id) => issue(id)));

    const json = await (await GET(cronRequest())).json();

    // Two reads: one full page, then a short one that ends the loop.
    expect(h.calls.ranges).toEqual([0, ALERT_LOG_PAGE]);
    // Every recorded id was seen, so none is alerted again and none is
    // mistaken for stale.
    expect(json.alerted).toBe(0);
    expect(json.cleared).toBe(0);
    expect(json.cleanupSkipped).toBeNull();
  });

  it("alerts an issue that really is absent from the log", async () => {
    // The positive control: without it, a reader that returned everything
    // regardless would satisfy the case above.
    h.state.loggedRows = [{ issue_id: "a" }, { issue_id: "b" }];
    h.getIssuesNeedingReview.mockResolvedValue([
      issue("a"),
      issue("b"),
      issue("new"),
    ]);

    const json = await (await GET(cronRequest())).json();

    expect(json.alerted).toBe(1);
    expect(h.calls.insert).toContainEqual({ issue_id: "new" });
  });
});
