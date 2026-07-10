// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const verifyCronAuth = vi.fn();
  const getIssuesNeedingReview = vi.fn();
  const slackPost = vi.fn(async () => ({ ok: true }));
  const state: {
    loggedRows: Array<{ issue_id: string }>;
  } = { loggedRows: [] };
  const calls: { insert: unknown[]; deleteIn: unknown[] } = {
    insert: [],
    deleteIn: [],
  };
  return { verifyCronAuth, getIssuesNeedingReview, slackPost, state, calls };
});

function builder() {
  return createQueryBuilder({
    select: () => ({ data: h.state.loggedRows, error: null }),
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

vi.mock("@/lib/cron/auth", () => ({ verifyCronAuth: h.verifyCronAuth }));
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

import { GET } from "./route";

const req = {} as Parameters<typeof GET>[0];

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
  h.verifyCronAuth.mockReturnValue(null);
  h.state.loggedRows = [];
  h.calls.insert = [];
  h.calls.deleteIn = [];
});

describe("sentry-alerts cron", () => {
  it("returns the unauthorized response when the bearer is missing", async () => {
    const unauth = { status: 401 };
    h.verifyCronAuth.mockReturnValue(unauth);
    expect(await GET(req)).toBe(unauth);
    expect(h.getIssuesNeedingReview).not.toHaveBeenCalled();
  });

  it("does nothing when no issues need review", async () => {
    h.getIssuesNeedingReview.mockResolvedValue([]);
    const res = await GET(req);
    expect(await res.json()).toEqual({
      success: true,
      alerted: 0,
      failed: 0,
      cleared: 0,
    });
    expect(h.slackPost).not.toHaveBeenCalled();
  });

  it("posts and records a new issue needing review", async () => {
    h.getIssuesNeedingReview.mockResolvedValue([issue("1")]);

    const res = await GET(req);
    const json = await res.json();

    expect(json).toEqual({ success: true, alerted: 1, failed: 0, cleared: 0 });
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

    expect(json).toEqual({ success: true, alerted: 1, failed: 1, cleared: 0 });
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
    });
    expect(h.calls.deleteIn).toEqual([]);
  });
});
