// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "../../../../../test/supabase-mock";

const h = vi.hoisted(() => {
  const state = {
    // What the guarded UPDATE's .select() resolves to, consumed in order so a
    // test can model "first click wins, second click matches no row".
    updateResults: [] as { data: unknown[] | null; error: unknown }[],
    request: {
      id: 7,
      status: "triaged",
      title: "Fix the thing",
      slack_ts: "1700000000.0001",
    } as Record<string, unknown> | null,
  };

  const calls = {
    tables: [] as string[],
    updates: [] as unknown[],
    eqs: [] as unknown[][],
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
        select: () =>
          state.updateResults.shift() ?? { data: [], error: null },
      });
    },
  };

  return {
    state,
    calls,
    serviceRoleClient,
    verifySlackRequest: vi.fn(() => true),
    slackPost: vi.fn(async () => ({})),
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
import { APPROVE_ACTION, REJECT_ACTION } from "@/lib/slack/views";
import type { NextRequest } from "next/server";

function decisionRequest(actionId: string, id = 7, userId = "U123") {
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
  h.calls.afterTasks = [];
  h.verifySlackRequest.mockReturnValue(true);
});

describe("slack interactivity signature check", () => {
  it("rejects a request with an invalid signature", async () => {
    h.verifySlackRequest.mockReturnValue(false);
    const res = await POST(decisionRequest(APPROVE_ACTION));
    expect(res.status).toBe(401);
    expect(h.calls.updates).toHaveLength(0);
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
