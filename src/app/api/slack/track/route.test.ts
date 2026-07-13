// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { GET, POST } from "./route";

/**
 * #663. /done read the request's status, returned early if it was already done or
 * invoiced, then inserted a billable time entry and flipped the status by id
 * alone. Two overlapping /done calls both passed that check and both billed, so
 * the same work went onto the invoice twice. The gate is now inside
 * complete_consulting_request, which claims the row and writes the time entry in
 * one transaction.
 *
 * The test that matters is the LOSER's: the caller whose claim matched no row must
 * bill nothing and post nothing.
 */
const h = vi.hoisted(() => ({
  /** What the RPC hands back: 'completed' = won the race, 'already_completed' = lost. */
  rpcOutcome: "completed" as string,
  /** Set to simulate the transaction itself failing. */
  rpcError: null as { message: string } | null,
  calls: {
    rpc: [] as unknown[],
    timeEntryInserts: [] as unknown[],
    slackPosts: [] as unknown[],
    closedIssues: [] as unknown[],
  },
}));

// `after` needs a real request scope, which a directly-invoked handler has no
// way to give it. Run the callback inline instead; NextResponse must stay real.
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    void fn();
  },
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: (name: string, args: unknown) => {
      h.calls.rpc.push({ name, args });
      return Promise.resolve({
        data: h.rpcError ? null : h.rpcOutcome,
        error: h.rpcError,
      });
    },
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => Promise.resolve({ data: [{ billed_min: 90 }], error: null });
      // If anything still reaches a direct time-entry insert, the race is back.
      b.insert = (payload: unknown) => {
        h.calls.timeEntryInserts.push(payload);
        return Promise.resolve({ error: null });
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/slack/requests", () => ({
  getRequest: async () => ({
    id: 14,
    title: "Fix the thing",
    status: "approved",
    type: "ad_hoc",
    rate: 75,
    github_issue_number: 321,
    slack_channel: "C1",
    slack_thread_ts: "111.222",
  }),
  postReply: async () => {},
  refreshRoot: async () => {},
}));
vi.mock("@/lib/slack/client", () => ({
  slackPost: (...a: unknown[]) => {
    h.calls.slackPosts.push(a);
    return Promise.resolve({});
  },
}));
vi.mock("@/lib/github", () => ({
  closeIssue: (n: unknown) => {
    h.calls.closedIssues.push(n);
    return Promise.resolve();
  },
}));

/** A POST that will actually run the /done body, with a valid secret. */
function donePost(): NextRequest {
  return {
    headers: { get: () => "secret" },
    nextUrl: new URL("https://nursedex.com/api/slack/track"),
    json: async () => ({
      request_id: 14,
      billed_min: 90,
      summary: "Shipped it",
      prs: [{ url: "https://github.com/x/y/pull/1" }],
    }),
  } as unknown as NextRequest;
}

/**
 * A request the handler can actually RUN, not just be refused by.
 *
 * It used to carry only headers, which is all the guard reads. That was enough
 * while the guard was there and a trap once it was gone: GET ran on to
 * `request.nextUrl.searchParams` and threw a TypeError, so the test went red on
 * the crash rather than on its own 401 assertion. It would have gone red with
 * the assertion DELETED too, which means the assertion was not what protected
 * the route, and the mutation gate could not see it because a POST sibling in
 * the same file failed on a real assertion and carried the whole file to KILLED
 * (#648).
 *
 * With a nextUrl the guardless handler runs on and answers 400 (bad request_id),
 * the 401 assertion is what fails, and the test is load-bearing again.
 */
function req(secretHeader: string | null): NextRequest {
  return {
    headers: { get: () => secretHeader },
    // A request_id that is not a number on purpose. Omitting it does NOT work:
    // Number(null) is 0, which is finite, so the handler would sail past its own
    // 400 and reach the real service-role client.
    nextUrl: new URL("https://nursedex.com/api/slack/track?request_id=nope"),
  } as unknown as NextRequest;
}

beforeEach(() => {
  delete process.env.ADMIN_SECRET;
  h.rpcOutcome = "completed";
  h.rpcError = null;
  h.calls.rpc.length = 0;
  h.calls.timeEntryInserts.length = 0;
  h.calls.slackPosts.length = 0;
  h.calls.closedIssues.length = 0;
});

describe("/api/slack/track auth guard", () => {
  it("GET returns 401 when ADMIN_SECRET is unset, even against the literal string 'undefined'", async () => {
    const res = await GET(req("undefined"));
    expect(res.status).toBe(401);
  });

  it("GET returns 401 with the wrong secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await GET(req("wrong"));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 when ADMIN_SECRET is unset", async () => {
    const res = await POST(req("undefined"));
    expect(res.status).toBe(401);
  });

  it("POST returns 401 with the wrong secret", async () => {
    process.env.ADMIN_SECRET = "secret";
    const res = await POST(req("wrong"));
    expect(res.status).toBe(401);
  });
});

describe("/done bills exactly once", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "secret";
  });

  it("bills the work and posts the report when it wins the race", async () => {
    const res = await POST(donePost());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.billed_hours).toBe(1.5);
    expect(json.cost).toBe(112.5);
    expect(h.calls.rpc).toHaveLength(1);
    expect(h.calls.slackPosts).toHaveLength(1);
  });

  it("claims the row and the time entry in one call, never a bare insert", async () => {
    await POST(donePost());

    // The billing must go through the transaction, not a separate insert that a
    // concurrent caller could also reach.
    expect(h.calls.timeEntryInserts).toHaveLength(0);
    expect(h.calls.rpc[0]).toMatchObject({
      name: "complete_consulting_request",
      args: { p_request_id: 14, p_billed_min: 90 },
    });
  });

  it("bills nothing and posts nothing when a concurrent /done already completed it", async () => {
    // The loser. Under the old code both callers passed the JS status check and
    // both inserted a time entry, so the work was invoiced twice.
    h.rpcOutcome = "already_completed";

    const res = await POST(donePost());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.already_completed).toBe(true);
    expect(h.calls.timeEntryInserts).toHaveLength(0);
    expect(h.calls.slackPosts).toHaveLength(0);
    expect(h.calls.closedIssues).toHaveLength(0);
  });

  it("reports the failure instead of a fake success when the transaction errors", async () => {
    // Fail loud: a /done that could not be recorded must not answer ok, and must
    // not post a completion report for billing that did not land.
    h.rpcError = { message: "deadlock detected" };

    const res = await POST(donePost());

    expect(res.status).toBe(500);
    expect(h.calls.slackPosts).toHaveLength(0);
    expect(h.calls.closedIssues).toHaveLength(0);
  });
});
