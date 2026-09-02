// @vitest-environment node
//
// What a failing scheduled job actually says in Slack (#796).
//
// The log a job produces is far longer than a Slack message, so something has
// to choose what survives. Choosing wrongly is not cosmetic: a message that
// arrives empty, or holding only the runner's banner, is an alert that says a
// job failed and nothing about why, which sends the reader to the Actions tab
// they were supposed to be spared.
import { describe, it, expect } from "vitest";
import { buildFailureReport, SLACK_REPORT_LIMIT } from "./ci-failure-report";

describe("buildFailureReport", () => {
  it("keeps a short log exactly as it was", () => {
    const log = "FAIL src/lib/__tests__/resend-health.test.ts\nAPI key invalid";
    expect(buildFailureReport(log)).toContain("API key invalid");
  });

  // Vitest prints the failures and then the summary, so the end of the log is
  // the part worth having. Keeping the head would deliver the banner and the
  // node version.
  it("keeps the end of a long log, where the failure summary is", () => {
    const log = `${"noise\n".repeat(5000)}FAIL: Resend returned 401`;

    const report = buildFailureReport(log);

    expect(report).toContain("FAIL: Resend returned 401");
    expect(report.length).toBeLessThanOrEqual(SLACK_REPORT_LIMIT + 200);
  });

  it("says when it dropped part of the log, rather than silently trimming", () => {
    const report = buildFailureReport("x".repeat(SLACK_REPORT_LIMIT * 2));
    expect(report).toMatch(/truncated/i);
  });

  /**
   * An empty log is itself a finding: the job failed before it produced any
   * output. Returning an empty report would send a Slack message with a title
   * and nothing under it, which reads as a formatting bug rather than as the
   * job dying early (L11, L98).
   */
  it("says the log was empty rather than sending nothing", () => {
    const report = buildFailureReport("");
    expect(report.trim().length).toBeGreaterThan(0);
    expect(report).toMatch(/no output/i);
  });

  it("says the log was empty when it held only whitespace", () => {
    expect(buildFailureReport("\n \n\t")).toMatch(/no output/i);
  });
});
