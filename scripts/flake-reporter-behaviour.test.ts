// @vitest-environment node
//
// The flake reporter's actual output, driven rather than read as source text.
//
// The notice it emits on EVERY run is what makes the flake rate countable at
// all (#818): without it, a run with no annotation means both "no flakes" and
// "this run predates the reporter", and the counter reads every older run as
// clean. Measured: 0 in 20 that way, against 3 in 13 of the runs that could
// actually report (L223).
//
// A source-text check that the emit sits outside the `if` is worth having, but
// it is not the same as watching the thing emit.
import { describe, it, expect, vi, afterEach } from "vitest";
import FlakeReporter from "../e2e/flake-reporter";
import { ANNOTATION_TITLES } from "./ci-annotations";

type AnyReporter = InstanceType<typeof FlakeReporter>;

/** Drive a reporter through some specs and capture everything it wrote. */
function run(specs: Array<{ title: string; file: string; outcome: string; retry: number; retries: number }>): string {
  const written: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });

  const reporter = new FlakeReporter() as AnyReporter;
  for (const spec of specs) {
    reporter.onTestEnd(
      {
        title: spec.title,
        retries: spec.retries,
        location: { file: `${process.cwd()}/${spec.file}` },
        outcome: () => spec.outcome,
      } as never,
      { retry: spec.retry, status: spec.outcome === "flaky" ? "passed" : "passed" } as never,
    );
  }
  reporter.onEnd({ status: "passed" } as never);

  spy.mockRestore();
  return written.join("");
}

const clean = {
  title: "loads",
  file: "e2e/a.spec.ts",
  outcome: "expected",
  retry: 0,
  retries: 2,
};
const flaky = {
  title: "reveals a nurse",
  file: "e2e/reveal.family.spec.ts",
  outcome: "flaky",
  retry: 1,
  retries: 2,
};

afterEach(() => vi.restoreAllMocks());

describe("the flake reporter's output", () => {
  it("announces itself on a run with no flakes at all", () => {
    const out = run([clean, clean]);
    expect(out).toContain(`::notice title=${ANNOTATION_TITLES.flakeCount}::`);
    expect(out).toContain("FLAKY_COUNT=0");
    expect(out).toContain("EXECUTED=2");
  });

  it("announces itself on a flaky run too, with the count", () => {
    const out = run([clean, flaky]);
    expect(out).toContain(`::notice title=${ANNOTATION_TITLES.flakeCount}::`);
    expect(out).toContain("FLAKY_COUNT=1");
  });

  // The warning is for a person scanning the run list; the notice is for the
  // counter. They are different jobs and only one of them is conditional.
  it("warns only when something actually flaked", () => {
    expect(run([clean])).not.toContain("::warning");
    expect(run([flaky])).toContain("::warning title=Playwright flakes::");
  });

  it("names the flaky spec so it can be opened without a search", () => {
    const out = run([flaky]);
    expect(out).toContain("reveal.family.spec.ts");
    expect(out).toContain("reveals a nurse");
  });

  // A run that selected nothing is not a clean run, and the reporter must not
  // let it read as one (L288).
  it("reports a run that executed nothing as exactly that", () => {
    const out = run([]);
    expect(out).toContain("FLAKY_COUNT=0");
    expect(out).toMatch(/no specs ran/i);
  });
});
