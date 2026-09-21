// @vitest-environment node
import { describe, it, expect } from "vitest";
import { UNATTRIBUTABLE_POST } from "./alert-tags";
import { NEEDS_REVIEW_QUERY } from "./issues";

/**
 * Measured against the live project on 2026-09-21, after #1098 shipped a fix
 * that did not work.
 *
 * #1098 tried to keep this class out of Slack by reporting it at `warning`,
 * on the reasoning that `issues.ts` selects `level:[error,fatal]`. A
 * deliberate probe at production proved that wrong. Sentry's issue search
 * matches a GROUP when ANY event in it carries the value, so NURSEDEX-SITE-11,
 * which holds two error events from 2026-09-20 and one warning event from the
 * probe, is returned by `level:warning` AND by `level:[error,fatal]` alike.
 * Its new warning event was grouped into the old issue because grouping keys
 * on the stack trace, which did not change, so the group can never shed its
 * error level history.
 *
 * The tag is the lever that does work, measured the same way on the `action`
 * tag already in use: `action:cron` returned 2 issues, `!action:cron` returned
 * 18, and the project holds 20. A negated tag excludes the whole group.
 *
 * One constant is the tag we set AND the exclusion in the query, so the two
 * cannot drift apart (L41).
 */
describe("the tag that keeps an unattributable POST out of Slack", () => {
  it("is excluded by the query the alert cron actually runs", () => {
    expect(NEEDS_REVIEW_QUERY).toContain(
      `!${UNATTRIBUTABLE_POST.key}:${UNATTRIBUTABLE_POST.value}`,
    );
  });

  it("uses the same tag key the cron and Stripe exclusions already use", () => {
    // A second key would mean a second thing to remember in the query.
    expect(UNATTRIBUTABLE_POST.key).toBe("action");
    expect(NEEDS_REVIEW_QUERY).toContain("!action:cron");
  });

  it("still selects real errors, so the exclusion is not swallowing everything", () => {
    expect(NEEDS_REVIEW_QUERY).toContain("level:[error,fatal]");
    expect(NEEDS_REVIEW_QUERY).toContain("is:for_review");
  });
});
