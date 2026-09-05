// @vitest-environment node
//
// Wiring test for the stale pull request report (#907).
//
// The workflow cannot run here, so this pins what makes it worth having: it
// runs on its own schedule, it can read the pull requests and their checks, a
// finding reaches Slack rather than an Actions tab nobody opens, and it is
// read-only.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCronSchedules, expectedIntervalMs } from "./scheduled-jobs";

const PATH = join(process.cwd(), ".github/workflows/stale-prs.yml");
const WORKFLOW = readFileSync(PATH, "utf8");

const EXECUTABLE = WORKFLOW.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("stale pull request workflow", () => {
  it("runs on a schedule of its own", () => {
    expect(parseCronSchedules(WORKFLOW).length).toBeGreaterThan(0);
  });

  it("runs at most weekly, so a fortnight-old PR is reported inside a week", () => {
    const interval = expectedIntervalMs(parseCronSchedules(WORKFLOW));
    expect(interval).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it("can be triggered by hand", () => {
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it("runs the checker", () => {
    expect(EXECUTABLE).toMatch(/scripts\/check-stale-prs\.ts/);
  });

  it("can read the pull requests and their checks", () => {
    // Both, not just one. Without checks: read the report still lists ages but
    // every PR reads as "checks could not be read", which is honest and
    // useless, and the permission is the kind of thing that is invisible when
    // missing because the code simply gets less back (L503).
    expect(EXECUTABLE).toMatch(/pull-requests:\s*read/);
    expect(EXECUTABLE).toMatch(/checks:\s*read/);
  });

  it("passes the Slack token, so a stale PR reaches somebody", () => {
    expect(EXECUTABLE).toMatch(/SLACK_BOT_TOKEN:\s*\$\{\{\s*secrets\./);
  });

  it("grants nothing that writes", () => {
    expect(EXECUTABLE).not.toMatch(/contents:\s*write/);
    expect(EXECUTABLE).not.toMatch(/pull-requests:\s*write/);
    expect(EXECUTABLE).not.toMatch(/checks:\s*write/);
  });

  it("carries a timeout, so a hung request cannot hold a runner for six hours", () => {
    expect(EXECUTABLE).toMatch(/timeout-minutes:/);
  });

  /**
   * The Job Watchdog reads every workflow with a cron and judges it against
   * its own schedule, so this one is watched for having stopped by being here
   * at all. Asserted rather than assumed, because the whole point of that
   * design is that nobody has to remember a list.
   */
  it("is a scheduled job the watchdog already knows about", async () => {
    const { collectScheduledWorkflows } = await import("./scheduled-jobs");
    const jobs = collectScheduledWorkflows([
      { path: ".github/workflows/stale-prs.yml", contents: WORKFLOW },
    ]);

    expect(jobs.map((j) => j.name)).toContain("Stale Pull Requests");
  });
});
