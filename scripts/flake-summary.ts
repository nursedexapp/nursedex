// Turning a Playwright run into a flake report (#805).
//
// `retries: 2` absorbs a failure, so a flaky run reports green and takes about
// twice as long: two of the ten most recent E2E runs took 413 and 462 seconds
// against 210 to 230 for clean ones. The only trace of WHICH spec flaked was
// one line in the job log and an artifact nobody opens, so a reviewer saw a
// green tick either way and nothing counted flakes across runs.
//
// Pure, so it can be tested without driving a browser. The Playwright reporter
// that feeds it is a thin shell in e2e/flake-reporter.ts.

export type SpecOutcome = {
  title: string;
  file: string;
  /** Playwright's own outcome: expected, unexpected, flaky, or skipped. */
  outcome: string;
  retries: number;
};

export type FlakeSummary = {
  count: number;
  executed: number;
  /** For GITHUB_STEP_SUMMARY. */
  markdown: string;
  /** One parseable line, so a later job can count flakes across runs (#818). */
  line: string;
};

export function summariseFlakes(specs: readonly SpecOutcome[]): FlakeSummary {
  // Only "flaky". A spec that failed every retry is "unexpected", and counting
  // those here would hide a hard failure inside a number people learn to
  // tolerate (L77 in reverse).
  const flaky = specs.filter((spec) => spec.outcome === "flaky");
  const executed = specs.length;

  const lines: string[] = ["### Playwright flakes", ""];

  if (executed === 0) {
    // A run that executed nothing is not a clean run, and a report that stayed
    // silent about it would read as one (L98, L288).
    lines.push(
      "**No specs ran at all.** That is not a pass: it means the suite did " +
        "not select anything, so nothing here has been verified.",
    );
  } else if (flaky.length === 0) {
    lines.push(`No flaky specs. ${executed} specs ran.`);
  } else {
    lines.push(
      `**${flaky.length} flaky ${flaky.length === 1 ? "spec" : "specs"}** ` +
        `out of ${executed} that ran. Each one passed only on a retry, so the ` +
        `run is green and roughly twice as long as a clean one.`,
      "",
    );
    for (const spec of flaky) {
      const retries = `${spec.retries} ${spec.retries === 1 ? "retry" : "retries"}`;
      lines.push(`- \`${spec.file}\` ${spec.title} (${retries})`);
    }
  }

  return {
    count: flaky.length,
    executed,
    markdown: lines.join("\n"),
    line: `FLAKY_COUNT=${flaky.length}`,
  };
}
