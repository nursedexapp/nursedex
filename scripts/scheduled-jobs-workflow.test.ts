// @vitest-environment node
//
// Wiring test for the scheduled job watchdog workflow (#837, #757).
//
// The workflow cannot run here, so this pins the properties that make it
// useful: it runs on its own schedule rather than inside anything it watches,
// it can reach both the Actions API and Slack, and it is read-only.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCronSchedules, expectedIntervalMs } from "./scheduled-jobs";

const PATH = join(process.cwd(), ".github/workflows/job-watchdog.yml");
const WORKFLOW = readFileSync(PATH, "utf8");

const EXECUTABLE = WORKFLOW.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("job watchdog workflow", () => {
  /**
   * The whole point. A check that lives inside the thing it watches dies with
   * it, and this one has to survive every job it reports on.
   */
  it("owns its own schedule", () => {
    const crons = parseCronSchedules(WORKFLOW);
    expect(crons.length).toBeGreaterThan(0);
  });

  /**
   * It cannot report a job as overdue sooner than it runs, so its own cadence
   * has to be no slower than the shortest thing it watches would tolerate.
   * Daily is well inside the 60 day window in which GitHub disables a
   * schedule, and inside a day and a half of a daily job's own interval.
   */
  it("runs at least daily, so a dead daily job is caught within days", () => {
    const interval = expectedIntervalMs(parseCronSchedules(WORKFLOW));
    expect(interval).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("can be triggered by hand", () => {
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it("runs the watchdog checker", () => {
    expect(WORKFLOW).toMatch(/scripts\/check-scheduled-jobs\.ts/);
  });

  it("can read the workflow runs it judges", () => {
    expect(WORKFLOW).toMatch(/actions:\s*read/);
  });

  /**
   * The Vercel crons are half of what this watches, and they are read over
   * HTTP because the watchdog deliberately does not run on Vercel's scheduler.
   * Without this credential that half silently drops out.
   */
  it("carries the credential for reading the cron heartbeats", () => {
    expect(WORKFLOW).toMatch(/HEARTBEAT_READ_SECRET:\s*\$\{\{\s*secrets\./);
  });

  it("passes the Slack token, so an overdue job reaches somebody", () => {
    expect(WORKFLOW).toMatch(/SLACK_BOT_TOKEN:\s*\$\{\{\s*secrets\./);
  });

  /**
   * Read-only, and listed rather than granted wholesale: an over-broad
   * permission is invisible because the code never attempts what it is not
   * meant to do (L503).
   */
  it("grants nothing that writes", () => {
    expect(EXECUTABLE).not.toMatch(/contents:\s*write/);
    expect(EXECUTABLE).not.toMatch(/actions:\s*write/);
  });
});
