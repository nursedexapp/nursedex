// @vitest-environment node
//
// Wiring test for the gated production migration push (#542).
//
// This workflow is the only thing in the repo with unattended write access to
// the production schema, so the properties that keep it safe are pinned here:
// it only runs on migration changes, it runs behind a GitHub Environment whose
// protection rule requires a human approval, and it proves the push actually
// landed instead of assuming a zero exit code meant success.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/apply-migrations.yml"),
  "utf8",
);

/** Comment lines explain the workflow; only executed lines can do damage. */
const EXECUTABLE = WORKFLOW.split("\n")
  .filter((line) => !line.trim().startsWith("#"))
  .join("\n");

describe("apply-migrations workflow", () => {
  it("runs behind an environment, which is what carries the approval gate", () => {
    // Without `environment:`, the push would run unattended on every merge.
    expect(EXECUTABLE).toMatch(/environment:\s*production-db/);
  });

  it("only triggers on pushes to main that touch migrations", () => {
    expect(EXECUTABLE).toMatch(/push:\s*\n\s*branches:\s*\[\s*main\s*\]/);
    expect(EXECUTABLE).toMatch(/paths:\s*\n\s*-\s*["']?supabase\/migrations\/\*\*/);
  });

  it("never runs on pull requests, where the gate would not apply", () => {
    expect(EXECUTABLE).not.toMatch(/pull_request:/);
  });

  it("applies pending migrations non-interactively", () => {
    expect(EXECUTABLE).toMatch(/db push .*--include-all/);
    expect(EXECUTABLE).toMatch(/db push .*--yes/);
  });

  it("verifies afterwards that production actually matches git", () => {
    // A zero exit from `db push` is not proof. Re-running the drift checker
    // is: it fails the job if anything is still unapplied.
    expect(EXECUTABLE).toMatch(/scripts\/check-migration-drift\.ts/);
  });

  it("never resets or wipes the database", () => {
    expect(EXECUTABLE).not.toMatch(/db\s+reset/);
    expect(EXECUTABLE).not.toMatch(/--linked.*reset/);
  });

  it("fails the step when any command in a pipeline fails", () => {
    expect(EXECUTABLE).toMatch(/set -euo pipefail/);
  });

  it("reads its production credentials from secrets, never from literals", () => {
    expect(EXECUTABLE).toMatch(/SUPABASE_ACCESS_TOKEN:\s*\$\{\{\s*secrets\./);
    expect(EXECUTABLE).toMatch(/SUPABASE_DB_PASSWORD:\s*\$\{\{\s*secrets\./);
    expect(EXECUTABLE).toMatch(/PROJECT_REF:\s*\$\{\{\s*secrets\./);
  });

  it("does not disable the concurrency guard, so two pushes cannot interleave", () => {
    expect(EXECUTABLE).toMatch(/concurrency:/);
    expect(EXECUTABLE).toMatch(/cancel-in-progress:\s*false/);
  });
});
