// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #663. ensureIssue() guarded itself with `if (req.github_issue_url) return`, then
 * called GitHub, and only wrote the URL back once GitHub answered. The gap between
 * the check and the write is a network round trip, so two callers (a double-clicked
 * Approve, or Triage racing the approval) both read a null URL, both passed, and
 * both opened an issue. One request, two GitHub issues, two "issue created" replies
 * in the thread.
 *
 * The claim now happens in the database before GitHub is called at all, so the
 * loser stops without creating anything.
 */
const h = vi.hoisted(() => ({
  /** false = a concurrent caller already claimed the right to create the issue. */
  claimMatches: true,
  /** Set to make the GitHub call blow up. */
  createFails: false,
  calls: {
    createdIssues: [] as unknown[],
    updates: [] as Record<string, unknown>[],
    replies: [] as unknown[],
  },
}));

vi.mock("@/lib/supabase/service-role", () => {
  const builder = () => {
    // ensureIssue also re-reads the row through getRequest, whose chain is
    // select().eq().single(). Only an UPDATE chain ends in a terminal .select(),
    // so the builder keys off that, exactly as the #652 harness does.
    let updating = false;
    const b: Record<string, unknown> = {};
    b.update = (patch: Record<string, unknown>) => {
      updating = true;
      h.calls.updates.push(patch);
      return b;
    };
    b.eq = () => b;
    b.is = () => b;
    // On an UPDATE, Postgres hands back one row to the winner of the claim and
    // zero rows to the loser. On a READ, .select() is just another link.
    b.select = () =>
      updating
        ? Promise.resolve(
            h.claimMatches
              ? { data: [{ id: 1 }], error: null }
              : { data: [], error: null },
          )
        : b;
    b.single = () => Promise.resolve({ data: { ...REQ }, error: null });
    // The write-back and release chains end at .eq() and are awaited directly.
    b.then = (resolve: (v: unknown) => unknown) => resolve({ error: null });
    return b;
  };
  return { createServiceRoleClient: () => ({ from: () => builder() }) };
});

vi.mock("@/lib/github", () => ({
  ISSUE_LABELS: ["consulting"],
  createIssue: (args: unknown) => {
    if (h.createFails) return Promise.reject(new Error("GitHub is down"));
    h.calls.createdIssues.push(args);
    return Promise.resolve({
      number: 321,
      html_url: "https://github.com/x/y/issues/321",
    });
  },
}));

vi.mock("./client", () => ({
  slackPost: () => Promise.resolve({ permalink: "https://slack/x" }),
}));

const REQ = {
  id: 14,
  title: "Fix the thing",
  description: "please",
  type: "ad_hoc",
  rate: 75,
  status: "approved",
  github_issue_url: null,
  slack_channel: "C1",
  slack_thread_ts: "111.222",
  suggested_labels: [],
} as unknown as import("./requests").RequestRow;

beforeEach(() => {
  vi.clearAllMocks();
  h.claimMatches = true;
  h.createFails = false;
  h.calls.createdIssues.length = 0;
  h.calls.updates.length = 0;
  h.calls.replies.length = 0;
});

describe("ensureIssue creates at most one GitHub issue", () => {
  it("creates the issue and stores it when it wins the claim", async () => {
    const { ensureIssue } = await import("./requests");

    await ensureIssue(REQ);

    expect(h.calls.createdIssues).toHaveLength(1);
    expect(h.calls.updates).toContainEqual(
      expect.objectContaining({
        github_issue_number: 321,
        github_issue_url: "https://github.com/x/y/issues/321",
      }),
    );
  });

  it("claims the row BEFORE calling GitHub, not after", async () => {
    const { ensureIssue } = await import("./requests");

    await ensureIssue(REQ);

    // The very first write must be the claim. If the issue is created first, the
    // race is still open however the row is written afterwards.
    expect(h.calls.updates[0]).toHaveProperty("github_issue_claimed_at");
  });

  it("creates NO issue when a concurrent caller already claimed it", async () => {
    h.claimMatches = false;
    const { ensureIssue } = await import("./requests");

    await ensureIssue(REQ);

    expect(h.calls.createdIssues).toHaveLength(0);
  });

  it("releases the claim when GitHub fails, so a retry can still open the issue", async () => {
    // Otherwise a single GitHub outage would wedge the request forever: the claim
    // would be held by an attempt that created nothing.
    h.createFails = true;
    const { ensureIssue } = await import("./requests");

    await ensureIssue(REQ);

    expect(h.calls.createdIssues).toHaveLength(0);
    expect(h.calls.updates).toContainEqual({ github_issue_claimed_at: null });
  });
});
