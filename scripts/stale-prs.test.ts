// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  STALE_AFTER_DAYS,
  classifyPr,
  selectStalePrs,
  summariseStalePrs,
  announcementTitle,
  type PrRecord,
} from "./stale-prs";

/**
 * #907. Nothing reported that a pull request had gone stale, so one could sit
 * red indefinitely and look exactly like a repo where nobody is working.
 *
 * PR #713 was opened on 2026-07-13 and merged on 2026-09-02. For those six
 * weeks it was failing a single check, and it carried the fix for three p0
 * privacy issues: a privacy policy making claims the code did not honour, and
 * personal data reaching session replay. The failing check was a test reading
 * a gitignored file, so it could never have passed in CI no matter how long it
 * waited. The cost was not the PR, it was what the PR was carrying.
 */
const NOW = new Date("2026-09-05T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const pr = (over: Partial<PrRecord> = {}): PrRecord => ({
  number: 713,
  title: "Stop personal data reaching session replay",
  url: "https://github.com/o/r/pull/713",
  createdAt: daysAgo(STALE_AFTER_DAYS + 1),
  isDraft: false,
  author: "someone",
  checks: "failing",
  ...over,
});

describe("which pull requests count as stale", () => {
  it("takes one older than the threshold", () => {
    expect(selectStalePrs([pr()], NOW)).toHaveLength(1);
  });

  it("leaves a young one alone", () => {
    expect(
      selectStalePrs([pr({ createdAt: daysAgo(STALE_AFTER_DAYS - 1) })], NOW),
    ).toHaveLength(0);
  });

  it("leaves a draft alone however old", () => {
    // A draft is a PR somebody is deliberately not finishing yet, so reporting
    // it weekly teaches the reader to skim the whole list.
    expect(
      selectStalePrs([pr({ isDraft: true, createdAt: daysAgo(90) })], NOW),
    ).toHaveLength(0);
  });

  it("refuses a created date it cannot read, rather than treating it as new", () => {
    // A date parsed straight into a comparison is NaN when the parse fails,
    // and NaN compares false against every threshold, so the PR would silently
    // be judged fresh forever and land on the permissive side (L50).
    expect(() =>
      selectStalePrs([pr({ createdAt: "not a date" })], NOW),
    ).toThrow(/could not be read/i);
  });

  it("orders the oldest first, because that is the one to look at", () => {
    const rows = selectStalePrs(
      [
        pr({ number: 2, createdAt: daysAgo(30) }),
        pr({ number: 1, createdAt: daysAgo(60) }),
      ],
      NOW,
    );

    expect(rows.map((r) => r.number)).toEqual([1, 2]);
  });
});

describe("what a pull request's checks are doing", () => {
  it("separates failing from merely old", () => {
    // A red PR and an old-but-green one need different things done to them,
    // and one message covering both sends the reader to the wrong place.
    expect(classifyPr(pr({ checks: "failing" })).failing).toBe(true);
    expect(classifyPr(pr({ checks: "passing" })).failing).toBe(false);
  });

  it("treats checks it could not read as its own state, not as passing", () => {
    // A red run and a refused run look identical in a list, and a refused run
    // is how CI itself stopping looks (L98). Calling either "passing" is the
    // reassuring answer and the wrong one.
    const unknown = classifyPr(pr({ checks: "unknown" }));

    expect(unknown.failing).toBe(false);
    expect(unknown.note).toMatch(/could not be read/i);
  });
});

describe("the message that goes out", () => {
  it("says plainly when nothing is stale", () => {
    // Nothing found and nothing checked must not read the same, which is why
    // this says what it looked at (L98).
    const text = summariseStalePrs([], 12);

    expect(text).toMatch(/no open pull request/i);
    expect(text).toContain("12");
  });

  it("names each one, how old it is, and where to look", () => {
    const text = summariseStalePrs(selectStalePrs([pr()], NOW), 5);

    expect(text).toContain("#713");
    expect(text).toContain("Stop personal data reaching session replay");
    expect(text).toContain("https://github.com/o/r/pull/713");
    expect(text).toMatch(/\d+ days/);
  });

  it("leads with the failing ones, since those cannot land as they are", () => {
    const rows = selectStalePrs(
      [
        pr({ number: 1, checks: "passing", createdAt: daysAgo(90) }),
        pr({ number: 2, checks: "failing", createdAt: daysAgo(30) }),
      ],
      NOW,
    );
    const text = summariseStalePrs(rows, 2);

    expect(text.indexOf("#2")).toBeLessThan(text.indexOf("#1"));
  });

  it("groups the dependabot ones so real work is not lost among them", () => {
    const rows = selectStalePrs(
      [
        pr({ number: 1, author: "app/dependabot", createdAt: daysAgo(40) }),
        pr({ number: 2, author: "app/dependabot", createdAt: daysAgo(41) }),
        pr({ number: 3, author: "someone", createdAt: daysAgo(42) }),
      ],
      NOW,
    );
    const text = summariseStalePrs(rows, 3);

    expect(text).toContain("#3");
    expect(text).toMatch(/2 dependabot/i);
    // Named as a count, not listed one by one, or they crowd out the one PR
    // somebody actually has to act on.
    expect(text).not.toContain("#1");
  });
});

describe("a check that has not finished", () => {
  it("is not reported as passing", () => {
    // This report only ever looks at pull requests a fortnight old, so a check
    // still going is stuck. Saying "checks passing" about a run nothing has
    // judged is the reassuring answer rather than the true one.
    const running = classifyPr(pr({ checks: "running" }));

    expect(running.failing).toBe(false);
    expect(running.note).toMatch(/still running/i);
    expect(running.note).not.toMatch(/passing/i);
  });
});

describe("who hears about it", () => {
  /**
   * #1079. This used to post to Slack every week, quiet weeks included, so
   * that silence could be told from the job having stopped. The Job Watchdog
   * now answers that question for this workflow, deriving its watched set from
   * the workflow files rather than a hand kept list, and it answers it better:
   * it knows the expected interval and speaks when a job is late, where a
   * weekly all clear relies on somebody noticing an absence.
   *
   * L98 is not what is being relaxed. A run that could not LOOK still fails,
   * in check-stale-prs.ts, so "nothing stale" is never said by a read that
   * fell over. What goes is the announcement of a genuine quiet week.
   */
  it("says nothing to Slack when no pull request is stale", () => {
    expect(announcementTitle(0)).toBeNull();
  });

  it("speaks when at least one is stale", () => {
    expect(announcementTitle(1)).toBe("Pull requests have been open for weeks");
  });
});
