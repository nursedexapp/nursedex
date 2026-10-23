// Reads the annotations recent runs left, and reports how often two tolerable
// outcomes actually happened (#818).
//
// Annotations rather than logs: they are queryable through the checks API
// without downloading a log per run, and both signals already emit them.
//
//   Playwright flake count   FLAKY_COUNT=<n> EXECUTED=<n>   from e2e/flake-reporter.ts
//   Merged tree proof        OUTCOME=held|refused|unavailable
//
// Each is emitted on EVERY run, so a run with no annotation means the run could
// not report, not that it was healthy (L223).
import {
  collectOutcomes,
  flakedInRun,
  formatRate,
  proofWasUnavailable,
  rateOf,
  shouldFail,
  type Api,
  type NamedRate,
} from "./ci-health";
import { ANNOTATION_TITLES } from "./ci-annotations";
import { createGitHubGet } from "./github-get";

const REPO = process.env.GITHUB_REPOSITORY ?? "";
const TOKEN = process.env.GITHUB_TOKEN ?? "";

/**
 * How many recent runs to read. Twenty is about two weeks of E2E runs, or
 * about three weeks of pushes for the proof, long enough for a rate to mean
 * something and short enough that a fault fixed last month stops being
 * reported.
 */
const RUNS_TO_READ = 20;

/**
 * Calibrated against the real distribution, not chosen for roundness (L172).
 * Measured 2026-08-30 over the runs that actually executed the suite: 3 flaky
 * in 13, about 23%. 40% sits well above that and well below the "something is
 * badly wrong" region, so ordinary variation will not fire it.
 */
const FLAKE_THRESHOLD = 0.4;

/**
 * The proof should essentially always be evaluable. It was 100% unavailable
 * while the token lacked pull-requests:read, and almost never since: measured
 * 2026-10-23 over the 32 pushes since 2026-09-14, 31 held and 1 was
 * unavailable (a single GitHub 500, which the read now retries). Over 20 push
 * runs a tenth allows two such blips and fails on the third, so one bad day
 * cannot fire it and a breaking lookup still does within a few merges.
 */
const PROOF_UNAVAILABLE_THRESHOLD = 0.1;

/** Below this many reporting runs a proportion is noise, so it is not judged. */
const MINIMUM_RUNS = 5;

const api: Api = createGitHubGet(TOKEN);

async function main(): Promise<void> {
  if (!REPO || !TOKEN) {
    process.stderr.write(
      "GITHUB_REPOSITORY and GITHUB_TOKEN must both be set. Refusing rather " +
        "than reporting a healthy zero from an unconfigured run.\n",
    );
    process.exit(1);
  }

  const flakes = rateOf(
    await collectOutcomes(api, REPO, "e2e.yml", ANNOTATION_TITLES.flakeCount, RUNS_TO_READ),
    { isBad: flakedInRun, threshold: FLAKE_THRESHOLD, minimumRuns: MINIMUM_RUNS },
  );

  const proof = rateOf(
    // Push runs only: the proof step runs only on a push to main, so a pull
    // request run is silent by construction and only shrank the denominator.
    // Over the last 20 runs of any kind that left about 5, where one GitHub
    // 500 was 20% and failed this job on 2026-10-19.
    await collectOutcomes(
      api,
      REPO,
      "ci.yml",
      ANNOTATION_TITLES.mergedTreeProof,
      RUNS_TO_READ,
      { event: "push" },
    ),
    {
      isBad: proofWasUnavailable,
      threshold: PROOF_UNAVAILABLE_THRESHOLD,
      minimumRuns: MINIMUM_RUNS,
    },
  );

  const rates: NamedRate[] = [
    { name: "Playwright flakes", result: flakes },
    { name: "Merged tree proof could not be evaluated", result: proof },
  ];
  const summary = rates.map((rate) => formatRate(rate, REPO)).join("\n\n");
  process.stdout.write(`${summary}\n`);

  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(path, `\n${summary}\n`);
  }

  if (shouldFail(rates)) process.exit(1);
}

void main();
