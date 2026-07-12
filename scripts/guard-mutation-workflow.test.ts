// @vitest-environment node
//
// Wiring test for the guard mutation step in CI (#642), in the same spirit as
// scripts/migration-drift-workflow.test.ts: the workflow cannot run itself in
// CI, so pin the properties that make it useful and safe.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CI = readFileSync(
  join(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

/** Comments explain the workflow. Only executed lines can do anything. */
const EXECUTABLE = CI.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("guard mutation runs in CI", () => {
  it("lives in the job main's ruleset actually requires", () => {
    // The required checks are the ones named in the ruleset: "lint, typecheck,
    // test", e2e, and Vercel. A brand new workflow would produce a check that is
    // NOT required, so a pull request whose guard tests cannot fail would still
    // be mergeable. Keeping this step inside the existing required job is what
    // makes it a gate rather than a notification.
    expect(CI).toMatch(/name: lint, typecheck, test/);

    const job = CI.slice(CI.indexOf("name: lint, typecheck, test"));
    expect(job).toMatch(/scripts\/guard-mutation\.ts/);
  });

  it("re-proves only what a pull request could have broken", () => {
    expect(EXECUTABLE).toMatch(
      /if: github\.event_name == 'pull_request'\s*\n\s*run: npx tsx scripts\/guard-mutation\.ts --since=origin\/\$\{\{ github\.base_ref \}\}/,
    );
  });

  it("sweeps every guard on merge to main", () => {
    // The backstop for anything the per-branch scope misses.
    expect(EXECUTABLE).toMatch(
      /if: github\.event_name == 'push'\s*\n\s*run: npx tsx scripts\/guard-mutation\.ts\s*$/m,
    );
  });

  it("checks out enough history to diff against the base branch", () => {
    // Without this the diff finds nothing, every branch reports "no guard
    // changed", and the gate silently passes everything: a check that cannot
    // fail, guarding tests that cannot fail.
    expect(EXECUTABLE).toMatch(/fetch-depth: 0/);
  });

  it("never commits or pushes the tree it just mutated", () => {
    // The runner rewrites real source files and restores them in a finally
    // block. If CI ever committed mid-run, this job would ship a codebase with
    // an authorization guard neutralized.
    expect(EXECUTABLE).not.toMatch(/git\s+commit/);
    expect(EXECUTABLE).not.toMatch(/git\s+push/);
  });
});
