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
import {
  collectScheduledWorkflows,
  parseCronSchedules,
  expectedIntervalMs,
  selfWorkflowSource,
} from "./scheduled-jobs";
import { readdirSync } from "node:fs";

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
/**
   * #1078. The record of what has already been announced survives between runs
   * in the Actions cache, and this job EXITS NON ZERO whenever there is a
   * finding, which is exactly the run whose record matters.
   *
   * So the save must be unconditional. A combined actions/cache step, or a
   * save without always(), would write the file only after a run that found
   * nothing, which has nothing to remember: the suppression would never once
   * take effect and every unit test of it would still pass, because none of
   * them can see this file (L3, L535).
   */
  it("saves the announcement record even when the run fails", () => {
    const save = EXECUTABLE.slice(EXECUTABLE.indexOf("actions/cache/save"));
    expect(save).toContain("actions/cache/save");

    // always() must be on the save step, not merely present in the file.
    const step = EXECUTABLE.slice(
      EXECUTABLE.lastIndexOf("- name:", EXECUTABLE.indexOf("actions/cache/save")),
      EXECUTABLE.indexOf("actions/cache/save") + 200,
    );
    expect(step).toMatch(/if:\s*always\(\)/);
  });

  it("restores the record before deciding whether to announce", () => {
    expect(EXECUTABLE).toContain("actions/cache/restore");
    // The restore has to come BEFORE the checker, or it reads nothing.
    expect(EXECUTABLE.indexOf("actions/cache/restore")).toBeLessThan(
      EXECUTABLE.indexOf("check-scheduled-jobs.ts"),
    );
    // And the save has to come after it, or it saves the pre-run file.
    expect(EXECUTABLE.indexOf("actions/cache/save")).toBeGreaterThan(
      EXECUTABLE.indexOf("check-scheduled-jobs.ts"),
    );
  });

  /**
   * A restore that only ever matched an exact key would miss every time, since
   * the key carries this run's own id, and a permanent miss reads as a working
   * suppression that simply never suppresses anything.
   */
  it("restores from a prefix, not only this run's own key", () => {
    expect(EXECUTABLE).toContain("restore-keys:");
  });

  it("grants nothing that writes", () => {
    expect(EXECUTABLE).not.toMatch(/contents:\s*write/);
    expect(EXECUTABLE).not.toMatch(/actions:\s*write/);
  });
});

/**
 * #967. GitHub dispatches every scheduled workflow in this repo hours after
 * its declared cron, and not by the same amount: measured over the last 100
 * scheduled runs of each on 2026-09-04, this one landed about 5 hours late at
 * ~11:20 UTC while the checks it watches landed at ~15:38 to ~17:07. So it was
 * judging the PREVIOUS day's run, every day, and a job that failed today could
 * not be reported until tomorrow.
 *
 * Declaring a later cron does not fix that, because the declared time is not
 * what GitHub honours, and ordering two jobs by arithmetic between their crons
 * is the thing that broke here in the first place (L386). The ordering has to
 * be a real dependency.
 */
describe("the watchdog runs after the checks it judges", () => {
  /**
   * The chained name is READ from the workflow it names, not restated here. A
   * `workflow_run` trigger matches by display name, and a name that matches
   * nothing fires nothing and reports no error, so a rename would silently
   * return the watchdog to judging yesterday (L100). Restating the string in
   * this test would only prove the test and the workflow agree with each
   * other, never that either agrees with the workflow being chained (L70).
   */
  const CHAINED_FROM = readFileSync(
    join(process.cwd(), ".github/workflows/prod-smoke.yml"),
    "utf8",
  ).match(/^name:\s*(.+)$/m)?.[1];

  it("is triggered by the completion of the last daily check", () => {
    expect(CHAINED_FROM).toBeTruthy();
    expect(EXECUTABLE).toMatch(/workflow_run:/);
    expect(EXECUTABLE).toContain(`workflows: ["${CHAINED_FROM}"]`);
  });

  it("fires on a completion whatever its conclusion", () => {
    // A failed check is exactly when the watchdog's reading matters, so
    // waiting for a success would go quiet at the worst moment.
    expect(EXECUTABLE).toMatch(/types:\s*\[completed\]/);
  });

  it("keeps its own schedule as well, so it survives the check it chains from", () => {
    // The chain alone would make the watchdog depend on the very kind of
    // failure it exists to report: if Production Smoke's schedule is disabled,
    // nothing would ever trigger the watchdog again and the silence would be
    // total (L98).
    expect(parseCronSchedules(WORKFLOW).length).toBeGreaterThan(0);
  });

  it("ignores the chained workflow's push-triggered runs", () => {
    // Production Smoke also runs on every push to main. Without this the
    // watchdog would run on every merge, and a standing overdue job would be
    // announced to Slack once per merge, which is how an alert stops being
    // read (L36).
    expect(EXECUTABLE).toMatch(
      /github\.event\.workflow_run\.event\s*==\s*'schedule'/,
    );
  });
  /**
   * The self entry is real, and the special case that handles it is live code.
   *
   * The watchdog derives its watched set from the workflow files, so it has
   * always included itself. If that ever stops being true the dispatch
   * measurement becomes a branch nothing reaches, and a reason recorded beside
   * code nothing calls is a decision nobody revisits (L346, L29).
   */
  it("watches itself, which is what the dispatch measurement is for", () => {
    const dir = join(process.cwd(), ".github/workflows");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => ({
        path: join(dir, f),
        contents: readFileSync(join(dir, f), "utf8"),
      }));

    const sources = collectScheduledWorkflows(files).map((j) => j.source);
    expect(sources).toContain("job-watchdog.yml");
  });

  /**
   * The link between the workflow and the entry it treats as itself. GitHub
   * sets GITHUB_WORKFLOW_REF from the file that is running, so the name the
   * script resolves has to be the name the watched set uses (L70: the two
   * sides of a guard must not come from one lookup).
   */
  it("resolves its own file name to the same string the watched set uses", () => {
    expect(
      selfWorkflowSource({
        GITHUB_WORKFLOW_REF:
          "nursedexapp/nursedex/.github/workflows/job-watchdog.yml@refs/heads/main",
      }),
    ).toBe(PATH.split("/").pop());
  });
});
