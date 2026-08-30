// @vitest-environment node
//
// Making Playwright flakes visible on every run (#805).
//
// `retries: 2` absorbs a failure, so a flaky run reports green and takes about
// twice as long: two of the ten most recent E2E runs took 413 and 462 seconds
// against 210 to 230 for clean ones. The only trace of WHICH spec flaked was
// one line in the job log and an artifact nobody opens, and nothing counted
// flakes across runs, so a reviewer saw a green tick either way.
//
// This is the instrument, and it comes before any experiment on the Playwright
// step, because a structural change to how a suite runs needs an instrument
// that already reports the thing the change could break (L309).
import { describe, it, expect } from "vitest";
import { summariseFlakes, type SpecOutcome } from "./flake-summary";

function spec(overrides: Partial<SpecOutcome> = {}): SpecOutcome {
  return {
    title: "a nurse onboards, and stays invisible until an admin approves",
    file: "e2e/onboarding.nurse.spec.ts",
    outcome: "flaky",
    retries: 1,
    ...overrides,
  };
}

describe("summariseFlakes", () => {
  it("counts the flaky specs and names each one", () => {
    const result = summariseFlakes([
      spec(),
      spec({ file: "e2e/blog.auth.spec.ts", title: "publishes a post", retries: 2 }),
      spec({ outcome: "expected" }),
    ]);
    expect(result.count).toBe(2);
    expect(result.markdown).toContain("onboarding.nurse.spec.ts");
    expect(result.markdown).toContain("blog.auth.spec.ts");
    expect(result.markdown).toContain("publishes a post");
  });

  it("says how many retries each flake needed, which is what it costs", () => {
    expect(summariseFlakes([spec({ retries: 2 })]).markdown).toMatch(/2 retries/);
    expect(summariseFlakes([spec({ retries: 1 })]).markdown).toMatch(/1 retry/);
  });

  // A reporter that prints nothing when there are no flakes is
  // indistinguishable from a reporter that did not run (L98). The point of an
  // instrument is that its silence means something.
  it("says so out loud when there were none, rather than printing nothing", () => {
    const result = summariseFlakes([spec({ outcome: "expected" })]);
    expect(result.count).toBe(0);
    expect(result.markdown).toMatch(/no flaky/i);
    expect(result.markdown.trim().length).toBeGreaterThan(0);
  });

  // Counting across runs (#818) needs something a later reader can parse
  // without reading prose.
  it("emits a machine readable count for counting across runs", () => {
    expect(summariseFlakes([spec(), spec()]).line).toBe("FLAKY_COUNT=2");
    expect(summariseFlakes([]).line).toBe("FLAKY_COUNT=0");
  });

  // L288: a run is judged first by how many tests it EXECUTED against how many
  // were expected, and only then by its failures. A parallel or server change
  // that silently drops a worker's share still prints a verdict.
  it("reports how many specs ran at all, so a half run is visible", () => {
    const result = summariseFlakes([spec(), spec({ outcome: "expected" })]);
    expect(result.executed).toBe(2);
    expect(result.markdown).toContain("2");
  });

  it("reports an empty run as zero executed rather than as a clean pass", () => {
    const result = summariseFlakes([]);
    expect(result.executed).toBe(0);
    expect(result.markdown).toMatch(/no specs ran/i);
  });

  // Playwright reports a spec that failed every retry as "unexpected", not
  // "flaky". Counting those as flakes would hide a hard failure inside a
  // number people learn to tolerate.
  it("does not count a spec that failed outright as flaky", () => {
    const result = summariseFlakes([spec({ outcome: "unexpected", retries: 2 })]);
    expect(result.count).toBe(0);
  });

  it("groups two flakes in the same file without losing either", () => {
    const result = summariseFlakes([
      spec({ title: "first" }),
      spec({ title: "second" }),
    ]);
    expect(result.count).toBe(2);
    expect(result.markdown).toContain("first");
    expect(result.markdown).toContain("second");
  });
});
