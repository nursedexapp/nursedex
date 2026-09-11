// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  planAlertLogCleanup,
  CLEANUP_SMALL_LOG,
  CLEANUP_MAX_SHARE,
} from "./alert-log-cleanup";

/**
 * #984. The cleanup deletes every previously alerted issue id missing from the
 * latest fetch. `getIssuesNeedingReview` is an external call, and it refuses a
 * FAILED read but not one that came back SHORT, which is the case that
 * actually happens: a rate limit, a changed filter, one page instead of three.
 * Every logged id then qualifies as stale, the log is emptied, and the next
 * run posts every issue to Slack again.
 *
 * The cost lands on a person. These go to the alerts channel, and a mass
 * re-alert is what teaches somebody to stop reading it (L36). Deleting nothing
 * is always safe here; deleting wrongly is not (L211).
 */
const ids = (n: number, prefix = "i") =>
  Array.from({ length: n }, (_, k) => `${prefix}${k}`);

describe("when the cleanup runs", () => {
  it("removes the ids the fetch no longer mentions", () => {
    const plan = planAlertLogCleanup({
      logged: ["a", "b", "c"],
      current: ["a"],
    });

    expect(plan.skipped).toBeNull();
    expect(plan.deleting.sort()).toEqual(["b", "c"]);
  });

  it("removes nothing when the fetch still mentions everything", () => {
    const plan = planAlertLogCleanup({
      logged: ["a", "b"],
      current: ["a", "b", "c"],
    });

    expect(plan.skipped).toBeNull();
    expect(plan.deleting).toEqual([]);
  });

  it("drains a small log completely, so it cannot silt up", () => {
    // A handful of rows going stale at once is ordinary: an operator marked
    // them reviewed. Refusing that would leave the log growing forever, and a
    // stale row suppresses the re-alert if its issue ever regresses.
    const logged = ids(CLEANUP_SMALL_LOG);
    const plan = planAlertLogCleanup({ logged, current: ["still-open"] });

    expect(plan.skipped).toBeNull();
    expect(plan.deleting.sort()).toEqual(logged.sort());
  });
});

describe("when the fetch cannot be trusted", () => {
  it("refuses when it returned nothing at all and the log is not empty", () => {
    // An empty read cannot justify emptying the log. This is the exact
    // signature of the failure: the call succeeded, returned no issues, and
    // every logged id therefore looks resolved.
    const plan = planAlertLogCleanup({ logged: ids(20), current: [] });

    expect(plan.deleting).toEqual([]);
    expect(plan.skipped).toMatch(/no issues/i);
  });

  it("drains a small log the fetch returned nothing for, so a quiet project clears", () => {
    // #1057. "No issues need review" is this project's ordinary healthy state,
    // so the empty-fetch refusal above fires on every run and the log can never
    // be cleared. The small-log allowance already says the whole of a log this
    // size going stale is not evidence of anything; an empty fetch is not
    // evidence either, at this size.
    const plan = planAlertLogCleanup({ logged: ["only"], current: [] });

    expect(plan.skipped).toBeNull();
    expect(plan.deleting).toEqual(["only"]);
  });

  it("still refuses an empty fetch once the log is past the small-log size", () => {
    // The negative half of the pair above: the refusal has to survive for the
    // population it was written for, or #984 is undone rather than narrowed.
    const logged = ids(CLEANUP_SMALL_LOG + 1);
    const plan = planAlertLogCleanup({ logged, current: [] });

    expect(plan.deleting).toEqual([]);
    expect(plan.skipped).toMatch(/no issues/i);
  });

  it("refuses when it would delete most of a log that is not small", () => {
    // Between two runs fifteen minutes apart, a few issues go stale. Most of
    // the log going stale at once is a read that saw less than reality.
    const plan = planAlertLogCleanup({
      logged: ids(100),
      current: ["i0", "i1"],
    });

    expect(plan.deleting).toEqual([]);
    expect(plan.skipped).toMatch(/98 of 100/);
  });

  it("allows a deletion just inside the share it tolerates", () => {
    // The positive control for the refusal above: without it, a rule that
    // refused everything would pass that test and delete nothing ever.
    const logged = ids(100);
    const stale = Math.floor(100 * CLEANUP_MAX_SHARE);
    const plan = planAlertLogCleanup({
      logged,
      current: logged.slice(stale),
    });

    expect(plan.skipped).toBeNull();
    expect(plan.deleting).toHaveLength(stale);
  });

  it("says nothing about an empty log, since there is nothing to protect", () => {
    // No rows and a suspicious read are not the same situation, and reporting
    // a skip here would make a healthy quiet run look like a refused one.
    const plan = planAlertLogCleanup({ logged: [], current: [] });

    expect(plan.deleting).toEqual([]);
    expect(plan.skipped).toBeNull();
  });
});
