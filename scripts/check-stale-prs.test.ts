// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  readOpenPulls,
  readChecks,
  checksFromRuns,
  authorOf,
  toRecord,
  type PullResponse,
} from "./check-stale-prs";

/**
 * #907. The decisions live in stale-prs.ts and are tested there. These cover
 * the part that reads GitHub: what each shape the API can hand back means, and
 * whether the list of pull requests is complete.
 *
 * The API call is an argument, so these run without a network. A function that
 * builds its own client can only ever be exercised against the shape that
 * happened to be live when it was written.
 */
const pull = (over: Partial<PullResponse> = {}): PullResponse => ({
  number: 1,
  title: "A change",
  html_url: "https://github.com/o/r/pull/1",
  created_at: "2026-07-13T00:00:00Z",
  draft: false,
  user: { login: "someone", type: "User" },
  head: { sha: "abc" },
  ...over,
});

describe("reading every open pull request", () => {
  it("keeps asking until a page comes back short", async () => {
    // A short page ends the loop, which is also what a truncated read looks
    // like, so one page is not assumed to be the lot. A repo with more open
    // pull requests than a page holds would otherwise have its OLDEST silently
    // outside the report, which are the ones it exists to find.
    const pages = [
      [pull({ number: 1 }), pull({ number: 2 })],
      [pull({ number: 3 })],
    ];
    const call = vi.fn(async () => pages.shift() ?? []);

    const all = await readOpenPulls(call as never, "o/r", 2);

    expect(all.map((p) => p.number)).toEqual([1, 2, 3]);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("stops after one page when that page is already short", async () => {
    const call = vi.fn(async () => [pull()]);

    await readOpenPulls(call as never, "o/r", 2);

    expect(call).toHaveBeenCalledTimes(1);
  });

  it("lets a failed read escape rather than reporting a short list", async () => {
    // A report of "nothing stale" assembled from a read that fell over is the
    // exact defect this check exists to remove (L98).
    const call = vi.fn(async () => {
      throw new Error("GitHub API 502");
    });

    await expect(readOpenPulls(call as never, "o/r")).rejects.toThrow(/502/);
  });
});

describe("what the check runs mean", () => {
  const run = (status: string, conclusion: string | null) => ({
    status,
    conclusion,
  });

  it("is failing when any completed run did not succeed", () => {
    expect(
      checksFromRuns({
        check_runs: [run("completed", "success"), run("completed", "failure")],
      }),
    ).toBe("failing");
  });

  it("is passing when every run completed and none failed", () => {
    expect(
      checksFromRuns({
        check_runs: [run("completed", "success"), run("completed", "skipped")],
      }),
    ).toBe("passing");
  });

  it("counts neutral and skipped as not a failure", () => {
    expect(checksFromRuns({ check_runs: [run("completed", "neutral")] })).toBe(
      "passing",
    );
  });

  it("is running, not passing, while one has not finished", () => {
    expect(
      checksFromRuns({
        check_runs: [run("completed", "success"), run("in_progress", null)],
      }),
    ).toBe("running");
  });

  it("prefers failing over running when both are true", () => {
    // A red check is actionable now; a queued one is not, and reporting the
    // queue would send the reader to the wrong thing.
    expect(
      checksFromRuns({
        check_runs: [run("completed", "failure"), run("queued", null)],
      }),
    ).toBe("failing");
  });

  it("is unknown, not passing, when there are no runs at all", () => {
    // A commit nothing judged. Calling that passing is the reassuring answer
    // and the wrong one, and it is also what CI having stopped looks like.
    expect(checksFromRuns({ check_runs: [] })).toBe("unknown");
    expect(checksFromRuns({})).toBe("unknown");
  });
});

describe("when the check API cannot be reached", () => {
  it("answers unknown rather than taking the whole report down", async () => {
    // One unreachable check API must not lose the ages of every other pull
    // request, and "unknown" is a state the message says out loud rather than
    // one that reads as fine.
    const log = vi.fn();
    const call = vi.fn(async () => {
      throw new Error("connection reset");
    });

    await expect(readChecks(call as never, "o/r", "abc", log)).resolves.toBe(
      "unknown",
    );
    expect(log.mock.calls[0]?.join(" ")).toContain("abc");
  });

  it("reads the state when it can", async () => {
    // The positive control: without it the fallback above could be satisfied
    // by a reader that answers unknown to everything.
    const call = vi.fn(async () => ({
      check_runs: [{ status: "completed", conclusion: "failure" }],
    }));

    await expect(readChecks(call as never, "o/r", "abc")).resolves.toBe(
      "failing",
    );
  });
});

describe("who opened it", () => {
  it("names a bot under its app prefix, so the report can group them", () => {
    expect(authorOf({ login: "dependabot[bot]", type: "Bot" })).toBe(
      "app/dependabot",
    );
  });

  it("judges by the account type, not by the name", () => {
    // A contributor called "dependabot-helper" must not be grouped away as a
    // bot and have their pull request counted rather than listed.
    expect(authorOf({ login: "dependabot-helper", type: "User" })).toBe(
      "dependabot-helper",
    );
  });

  it("answers an empty author for a deleted account rather than throwing", () => {
    expect(authorOf(null)).toBe("");
  });
});

describe("the record the report reasons about", () => {
  it("carries the fields the message needs", () => {
    expect(toRecord(pull(), "failing")).toEqual({
      number: 1,
      title: "A change",
      url: "https://github.com/o/r/pull/1",
      createdAt: "2026-07-13T00:00:00Z",
      isDraft: false,
      author: "someone",
      checks: "failing",
    });
  });
});
