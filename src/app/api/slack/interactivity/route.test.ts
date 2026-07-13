// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const state = {
    // What the guarded UPDATE's .select() resolves to, consumed in order so a
    // test can model "first click wins, second click matches no row".
    updateResults: [] as { data: unknown[] | null; error: unknown }[],
    /** Set to make the consulting_requests insert collide (#708). */
    insertError: null as { message: string; code?: string } | null,
    request: {
      id: 7,
      status: "triaged",
      title: "Fix the thing",
      slack_ts: "1700000000.0001",
    } as Record<string, unknown> | null,
  };

  const calls = {
    tables: [] as string[],
    inserts: [] as unknown[],
    updates: [] as unknown[],
    eqs: [] as unknown[][],
    // Filters expressed as .not(...), which is how triage refuses to resurrect a
    // request that has already been completed or invoiced (#663).
    nots: [] as unknown[][],
    afterTasks: [] as Promise<unknown>[],
  };

  const serviceRoleClient = {
    from: (table: string) => {
      calls.tables.push(table);
      return createQueryBuilder({
        update: (patch: unknown) => {
          calls.updates.push(patch);
          return "chain";
        },
        eq: (...args: unknown[]) => {
          calls.eqs.push(args);
          return "chain";
        },
        not: (...args: unknown[]) => {
          calls.nots.push(args);
          return "chain";
        },
        insert: (payload: unknown) => {
          calls.inserts.push(payload);
          return "chain";
        },
        single: () =>
          state.insertError
            ? { data: null, error: state.insertError }
            : { data: { id: 7 }, error: null },
        select: () =>
          state.updateResults.shift() ?? { data: [], error: null },
        // The triage UPDATE has no terminal .select(): it is awaited straight off
        // its last filter, so the builder has to be thenable for it.
        then: () => ({ data: null, error: null }),
      });
    },
  };

  return {
    state,
    calls,
    serviceRoleClient,
    verifySlackRequest: vi.fn(() => true),
    // Slack answers chat.postMessage with the new message's timestamp, and the
    // handler needs it: the thread root has to exist before the row is inserted
    // (slack_thread_ts is NOT NULL), and on a duplicate it is the handle used to
    // take that root back down.
    slackPost: vi.fn(async (_method: string, _args?: unknown) => ({
      ts: "1700000000.0001",
    })),
    getRequest: vi.fn(async () => state.request),
    ensureIssue: vi.fn(async () => undefined),
    postReply: vi.fn(async () => undefined),
    refreshRoot: vi.fn(async () => undefined),
  };
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    // Run the deferred work immediately, recording it so tests can await it.
    after: (fn: () => unknown) => {
      h.calls.afterTasks.push(Promise.resolve(fn()));
    },
  };
});
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => h.serviceRoleClient,
}));
vi.mock("@/lib/slack/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/slack/client")>();
  return {
    ...actual,
    verifySlackRequest: h.verifySlackRequest,
    slackPost: h.slackPost,
  };
});
vi.mock("@/lib/slack/requests", () => ({
  getRequest: h.getRequest,
  ensureIssue: h.ensureIssue,
  postReply: h.postReply,
  refreshRoot: h.refreshRoot,
}));
vi.mock("@/lib/ai/estimate", () => ({ estimateRequest: vi.fn() }));

import { POST } from "./route";
import {
  APPROVE_ACTION,
  REJECT_ACTION,
  TRIAGE_CALLBACK,
  NEW_REQUEST_CALLBACK,
} from "@/lib/slack/views";
import type { NextRequest } from "next/server";

function decisionRequest(
  actionId: string,
  id = 7,
  userId = "U123",
  headers?: Record<string, string>,
) {
  const payload = {
    type: "block_actions",
    user: { id: userId },
    actions: [{ action_id: actionId, value: String(id) }],
  };
  const body = new URLSearchParams({
    payload: JSON.stringify(payload),
  }).toString();
  return new Request("https://nursedex.com/api/slack/interactivity", {
    method: "POST",
    body,
    headers,
  }) as unknown as NextRequest;
}

/** A submitted triage modal: billing type plus an hours estimate. */
function triageRequest(id = 7, type: "ad_hoc" | "maintenance" = "ad_hoc") {
  const payload = {
    type: "view_submission",
    user: { id: "U123" },
    view: {
      callback_id: TRIAGE_CALLBACK,
      private_metadata: String(id),
      state: {
        values: {
          type: { value: { selected_option: { value: type } } },
          estimate: { value: { value: "2" } },
        },
      },
    },
  };
  const body = new URLSearchParams({
    payload: JSON.stringify(payload),
  }).toString();
  return new Request("https://nursedex.com/api/slack/interactivity", {
    method: "POST",
    body,
  }) as unknown as NextRequest;
}

async function settleAfter() {
  await Promise.all(h.calls.afterTasks);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.updateResults = [];
  h.state.request = {
    id: 7,
    status: "triaged",
    title: "Fix the thing",
    slack_ts: "1700000000.0001",
  };
  h.calls.tables = [];
  h.calls.updates = [];
  h.calls.eqs = [];
  h.calls.nots = [];
  h.calls.inserts = [];
  h.state.insertError = null;
  h.calls.afterTasks = [];
  h.verifySlackRequest.mockReturnValue(true);
});

describe("slack interactivity signature check", () => {
  it("rejects a request with an invalid signature and fires no side effect", async () => {
    h.verifySlackRequest.mockReturnValue(false);
    const res = await POST(decisionRequest(APPROVE_ACTION));
    expect(res.status).toBe(401);
    expect(h.calls.updates).toHaveLength(0);
    // A spoofed admin action must not reach Slack either, not just the DB.
    expect(h.slackPost).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header, without acting", async () => {
    h.verifySlackRequest.mockReturnValue(false);
    const res = await POST(decisionRequest(APPROVE_ACTION));
    expect(res.status).toBe(401);
    expect(h.slackPost).not.toHaveBeenCalled();
    expect(h.calls.updates).toHaveLength(0);
  });

  it("passes the raw body and the signature headers through to the verifier", async () => {
    h.verifySlackRequest.mockReturnValue(false);
    await POST(
      decisionRequest(APPROVE_ACTION, 7, "U123", {
        "x-slack-signature": "v0=abc",
        "x-slack-request-timestamp": "1700000000",
      }),
    );
    expect(h.verifySlackRequest).toHaveBeenCalledWith(
      expect.stringContaining("payload="),
      "v0=abc",
      "1700000000",
    );
  });
});

describe("consulting request decision guard (issue #562)", () => {
  it("guards the UPDATE on the triaged status, not just a prior read", async () => {
    h.state.updateResults = [{ data: [{ id: 7 }], error: null }];
    await POST(decisionRequest(APPROVE_ACTION));
    await settleAfter();

    expect(h.calls.tables).toEqual(["consulting_requests"]);
    expect(h.calls.eqs).toEqual([
      ["id", 7],
      ["status", "triaged"],
    ]);
  });

  it("approves once and files exactly one GitHub issue on a double click", async () => {
    // First click matches the triaged row; the second matches nothing because
    // the first already moved it to approved.
    h.state.updateResults = [
      { data: [{ id: 7 }], error: null },
      { data: [], error: null },
    ];

    await POST(decisionRequest(APPROVE_ACTION));
    await POST(decisionRequest(APPROVE_ACTION));
    await settleAfter();

    expect(h.ensureIssue).toHaveBeenCalledTimes(1);
    expect(h.postReply).toHaveBeenCalledTimes(1);
    expect(h.refreshRoot).toHaveBeenCalledTimes(1);
  });

  it("does not post or file anything when the row was already decided", async () => {
    h.state.updateResults = [{ data: [], error: null }];
    await POST(decisionRequest(APPROVE_ACTION));
    await settleAfter();

    expect(h.ensureIssue).not.toHaveBeenCalled();
    expect(h.postReply).not.toHaveBeenCalled();
    expect(h.refreshRoot).not.toHaveBeenCalled();
  });

  it("fires no side effects when the guarded update errors", async () => {
    h.state.updateResults = [{ data: null, error: { message: "db down" } }];
    await POST(decisionRequest(APPROVE_ACTION));
    await settleAfter();

    expect(h.ensureIssue).not.toHaveBeenCalled();
    expect(h.postReply).not.toHaveBeenCalled();
  });

  it("never files a GitHub issue when the decision is a rejection", async () => {
    h.state.updateResults = [{ data: [{ id: 7 }], error: null }];
    await POST(decisionRequest(REJECT_ACTION));
    await settleAfter();

    expect(h.postReply).toHaveBeenCalledTimes(1);
    expect(h.ensureIssue).not.toHaveBeenCalled();
  });

  it("loses an approve/reject race without double-firing side effects", async () => {
    // Approve wins the UPDATE; the concurrent reject matches no triaged row.
    h.state.updateResults = [
      { data: [{ id: 7 }], error: null },
      { data: [], error: null },
    ];

    await Promise.all([
      POST(decisionRequest(APPROVE_ACTION)),
      POST(decisionRequest(REJECT_ACTION)),
    ]);
    await settleAfter();

    expect(h.postReply).toHaveBeenCalledTimes(1);
    expect(h.ensureIssue).toHaveBeenCalledTimes(1);
  });

  it("skips the write entirely when the pre-read shows a non-triaged row", async () => {
    h.state.request = { id: 7, status: "approved", title: "t", slack_ts: "1" };
    await POST(decisionRequest(APPROVE_ACTION));
    await settleAfter();

    expect(h.calls.updates).toHaveLength(0);
    expect(h.ensureIssue).not.toHaveBeenCalled();
  });
});

// #663. Triage wrote type, rate, estimate and status by id alone. Re-triaging an
// OPEN request is legitimate (an estimate gets revised), so this is not a one-way
// transition and must not be guarded as one. What it must never do is resurrect a
// request that has already been completed or invoiced: a stale modal, submitted
// late, would drag a request that was already billed back to triaged.
describe("triage cannot resurrect a completed request (issue #663)", () => {
  it("refuses the write on a request that is already done or invoiced", async () => {
    const res = await POST(triageRequest());

    expect(res.status).toBe(200);
    expect(h.calls.updates).toHaveLength(1);
    // The precondition rides in the query, not in a prior read.
    expect(h.calls.nots).toContainEqual([
      "status",
      "in",
      "(done,invoiced)",
    ]);
  });

  it("still writes the revised estimate, so re-triaging an open request works", async () => {
    await POST(triageRequest(7, "ad_hoc"));

    expect(h.calls.updates[0]).toMatchObject({
      type: "ad_hoc",
      estimate_hours: 2,
      status: "triaged",
    });
  });
});

/** A submitted "new request" modal. `viewId` is what Slack keeps stable on a retry. */
function newRequestSubmission(viewId = "V-100") {
  const payload = {
    type: "view_submission",
    user: { id: "U123" },
    view: {
      id: viewId,
      callback_id: NEW_REQUEST_CALLBACK,
      state: {
        values: {
          title: { value: { value: "Fix the thing" } },
          description: { value: { value: "It is broken" } },
        },
      },
    },
  };
  const body = new URLSearchParams({
    payload: JSON.stringify(payload),
  }).toString();
  return new Request("https://nursedex.com/api/slack/interactivity", {
    method: "POST",
    body,
  }) as unknown as NextRequest;
}

// #708. A new request was a bare insert with nothing to stop a repeat: the only
// unique index is on the thread, and a repeat creates a fresh thread, so it wrote
// a second request, pinged ops again and paid for a second AI estimate. Slack
// re-delivers a webhook whose first delivery timed out, replaying the identical
// payload, so this is a retry problem rather than a double-click problem.
describe("a re-delivered request modal creates only one request (issue #708)", () => {
  it("stores the modal's view id, which is what Slack keeps stable on a retry", async () => {
    await POST(newRequestSubmission("V-abc"));
    await settleAfter();

    expect(h.calls.inserts[0]).toMatchObject({ slack_view_id: "V-abc" });
  });

  it("creates no second request when Slack re-delivers the same submission", async () => {
    // The re-delivery. Postgres rejects the repeated view id, and everything
    // downstream (the ops ping, the AI estimate) must not run a second time.
    h.state.insertError = { message: "duplicate key value", code: "23505" };

    const res = await POST(newRequestSubmission("V-abc"));
    await settleAfter();

    expect(res.status).toBe(200);
    // The estimate is the expensive one: a second call is a second AI bill for a
    // request that already has its estimate.
    expect(h.calls.afterTasks).toHaveLength(0);
  });

  it("takes down the orphaned thread root it posted before discovering the duplicate", async () => {
    // The root has to be posted before the insert (slack_thread_ts is NOT NULL),
    // so a duplicate always posts one. Leaving it would strand an empty thread
    // next to the real request.
    h.state.insertError = { message: "duplicate key value", code: "23505" };

    await POST(newRequestSubmission("V-abc"));
    await settleAfter();

    const deleted = h.slackPost.mock.calls.filter(
      (c) => c[0] === "chat.delete",
    );
    expect(deleted).toHaveLength(1);
  });
});
