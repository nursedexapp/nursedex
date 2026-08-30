// A Playwright reporter that makes flakes visible on the run itself (#805).
//
// The suite runs with `retries: 2`, so a flaky spec produces a GREEN run that
// takes about twice as long. Before this, the only trace was one line in the
// job log and an uploaded artifact nobody opens, and nothing counted flakes
// across runs.
//
// Deliberately thin: every decision lives in scripts/flake-summary.ts, which is
// unit tested without driving a browser.
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { appendFileSync } from "node:fs";
import { relative } from "node:path";
import { summariseFlakes, type SpecOutcome } from "../scripts/flake-summary";
import { ANNOTATION_TITLES } from "../scripts/ci-annotations";

export default class FlakeReporter implements Reporter {
  private readonly specs: SpecOutcome[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // Only the final attempt carries the spec's verdict; the earlier ones are
    // the retries it took. Counting every attempt would report one flaky spec
    // as three.
    if (result.retry < test.retries && result.status !== "passed") return;
    this.specs.push({
      title: test.title,
      file: relative(process.cwd(), test.location.file),
      outcome: test.outcome(),
      retries: result.retry,
    });
  }

  onEnd(_result: FullResult): void {
    const summary = summariseFlakes(this.specs);

    // stdout so it is in the job log whatever else happens, and the step
    // summary so a reviewer sees it without opening the log.
    process.stdout.write(`\n${summary.line}\n${summary.markdown}\n`);

    const path = process.env.GITHUB_STEP_SUMMARY;
    if (path) appendFileSync(path, `\n${summary.markdown}\n`);

    // Annotations, because they are queryable through the checks API without
    // downloading a log, which is what lets #818 count these across runs.
    //
    // A notice on EVERY run, carrying the count even when it is zero. Without
    // it, a run with no annotation means both "no flakes" and "this run
    // predates the reporter", and a counter cannot tell those apart: it would
    // read every older run as clean and report a flake rate far below the real
    // one (L98, L223). Found by trying to count them and getting 3 in 13 from
    // a population that mostly could not have reported at all.
    process.stdout.write(
      `::notice title=${ANNOTATION_TITLES.flakeCount}::FLAKY_COUNT=${summary.count} ` +
        `EXECUTED=${summary.executed}\n`,
    );

    // And a warning when there were any, so a flaky run is visibly different
    // in the run list rather than only to somebody who opens it. A green tick
    // that cost three minutes of retries should not look like one that did not.
    if (summary.count > 0) {
      process.stdout.write(
        `::warning title=Playwright flakes::${summary.count} spec(s) passed ` +
          `only on retry. See the step summary.\n`,
      );
    }
  }
}
