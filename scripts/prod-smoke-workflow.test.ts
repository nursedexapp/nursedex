// @vitest-environment node
//
// Wiring test for the production smoke workflow (#521).
//
// The workflow cannot run itself in CI, so these tests pin the properties that
// make it useful and safe: it runs after a merge, on a schedule, and on demand
// after a manual `db push`; it feeds production's catalog through the checker;
// and above all it never writes to production. A check that quietly mutated the
// database it was meant to be watching would be worse than no check.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/prod-smoke.yml"),
  "utf8",
);

/** Comments explain the workflow; only executed lines can do damage. */
const EXECUTABLE = WORKFLOW.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("prod-smoke workflow", () => {
  it("runs right after a merge to main, when a migration has most likely just landed", () => {
    expect(WORKFLOW).toMatch(/push:\s*\n\s*branches:\s*\[\s*main\s*\]/);
  });

  it("runs on a daily schedule, since a grant can change with no push at all", () => {
    expect(WORKFLOW).toMatch(/schedule:\s*\n\s*-\s*cron:/);
  });

  it("can be triggered by hand, right after a manual db push", () => {
    expect(WORKFLOW).toMatch(/workflow_dispatch:/);
  });

  it("feeds production's catalog through the checker", () => {
    expect(WORKFLOW).toMatch(/db query --linked --output-format json/);
    expect(WORKFLOW).toMatch(/scripts\/prod-smoke\.sql/);
    expect(WORKFLOW).toMatch(/scripts\/check-prod-smoke\.ts/);
  });

  // The whole point is that it is safe to aim at production. If it can write,
  // it is not safe, and nobody will trust it enough to run it.
  it("never writes to production: no db push, no reset, no migration apply", () => {
    expect(EXECUTABLE).not.toMatch(/db\s+push/);
    expect(EXECUTABLE).not.toMatch(/db\s+reset/);
    expect(EXECUTABLE).not.toMatch(/migration\s+(up|repair)/);
  });

  // A pipeline swallows the exit code of everything but its last command, so
  // without this a CLI that failed to connect would still let the job pass.
  it("fails the job when any command in the pipeline fails", () => {
    expect(EXECUTABLE).toMatch(/set -euo pipefail/);
  });

  /**
   * A third independent question of production (#746): how much of the plan's
   * included usage is left. It rides here because it needs the same link and
   * the same credentials, and a job of its own would bill another runner
   * minute a day to ask one query.
   */
  it("asks how much of the plan's included usage is left", () => {
    expect(EXECUTABLE).toMatch(/scripts\/supabase-usage\.sql/);
    expect(EXECUTABLE).toMatch(/scripts\/check-supabase-usage\.ts/);
  });

  /**
   * Each of the three steps asks a different question, so each needs its own
   * failure boundary. Without one, the first failure hides the others on
   * exactly the run where every answer matters most.
   */
  it("runs every question even when an earlier one failed", () => {
    const always = EXECUTABLE.match(/if:\s*always\(\)/g) ?? [];
    expect(always.length).toBeGreaterThanOrEqual(2);
  });
});
